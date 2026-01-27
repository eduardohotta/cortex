import sys
import json
import numpy as np
import os
import signal
import argparse
import threading
import queue
from faster_whisper import WhisperModel

# Optional: sounddevice for direct audio capture
try:
    import sounddevice as sd
    HAS_SOUNDDEVICE = True
except ImportError:
    HAS_SOUNDDEVICE = False

# Prevent buffering for real-time stdout communication
try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass


def list_audio_devices():
    if not HAS_SOUNDDEVICE:
        return {"error": "sounddevice not installed"}

    devices = sd.query_devices()
    device_list = []
    for i, d in enumerate(devices):
        device_list.append({
            "id": i,
            "name": d.get("name"),
            "hostapi": d.get("hostapi"),
            "max_input_channels": d.get("max_input_channels"),
            "max_output_channels": d.get("max_output_channels"),
            "default_samplerate": d.get("default_samplerate")
        })
    return device_list


class WhisperService:
    def __init__(self, model_size="base", device="cpu", compute_type="int8", language=None):
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.language = language

        self.model = None
        self.is_running = False

        self.audio_queue = queue.Queue()
        self.last_text = ""

    # ===========================
    # MODEL LOADING
    # ===========================
    def load_model(self):
        try:
            print(json.dumps({
                "status": "loading_model",
                "model": self.model_size,
                "device": self.device
            }), flush=True)

            self.model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type
            )
            return True

        except Exception as e:
            error_msg = str(e)
            print(json.dumps({
                "warning": f"Model load failed on {self.device}: {error_msg}"
            }), flush=True)

            # Auto-fallback to CPU if CUDA fails
            if self.device in ("cuda", "auto"):
                print(json.dumps({
                    "status": "fallback_cpu",
                    "message": "Falling back to CPU..."
                }), flush=True)
                try:
                    self.device = "cpu"
                    self.compute_type = "int8"
                    self.model = WhisperModel(
                        self.model_size,
                        device="cpu",
                        compute_type="int8"
                    )
                    return True
                except Exception as cpu_e:
                    print(json.dumps({
                        "error": f"CPU Fallback failed: {str(cpu_e)}"
                    }), flush=True)
                    return False

            print(json.dumps({
                "error": f"Failed to load model: {error_msg}"
            }), flush=True)
            return False

    # ===========================
    # TRANSCRIPTION
    # ===========================
    def transcribe_chunk(self, audio_data):
        if self.model is None:
            raise RuntimeError("Model not loaded")

        try:
            segments, info = self.model.transcribe(
                audio_data,
                beam_size=5,
                language=self.language,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=200),
                task="transcribe",
                condition_on_previous_text=False
            )

            HALLUCINATIONS = [
                "Obrigado.", "Obrigado!", "Tchau.", "Tchau!",
                "Obrigado por assistir.", "Legenda por",
                "Amara.org", "Sous-titres", "Untertitel",
                "subtitle", "caption"
            ]

            results = []
            for segment in segments:
                text = segment.text.strip()

                if not text or len(text) < 2:
                    continue

                if any(h.lower() in text.lower() for h in HALLUCINATIONS):
                    continue

                if len(text) > 10 and text == self.last_text:
                    continue

                if segment.avg_logprob < -1.0:
                    continue

                results.append({
                    "text": text,
                    "start": float(segment.start),
                    "end": float(segment.end),
                    "probability": float(segment.avg_logprob)
                })

                self.last_text = text

            return results, info

        except Exception as e:
            error_msg = str(e)

            if (
                ("dll" in error_msg.lower() or
                 "cublas" in error_msg.lower() or
                 "library" in error_msg.lower())
                and self.device in ("cuda", "auto")
            ):
                print(json.dumps({
                    "status": "fallback_cpu",
                    "message": f"CUDA Error: {error_msg}. Switching to CPU..."
                }), flush=True)

                try:
                    self.device = "cpu"
                    self.compute_type = "int8"
                    self.model = WhisperModel(
                        self.model_size,
                        device="cpu",
                        compute_type="int8"
                    )
                    return self.transcribe_chunk(audio_data)
                except Exception as cpu_e:
                    print(json.dumps({
                        "error": f"CPU Fallback failed during runtime: {str(cpu_e)}"
                    }), flush=True)

            raise

    # ===========================
    # AUDIO INPUT
    # ===========================
    def audio_callback(self, indata, frames, time, status):
        if status:
            print(str(status), file=sys.stderr)
        self.audio_queue.put(indata.copy())

    def run_capture(self, device_id):
        if not HAS_SOUNDDEVICE:
            print(json.dumps({"error": "sounddevice not installed"}), flush=True)
            return

        print(json.dumps({
            "status": "ready",
            "model": self.model_size,
            "mode": "capture",
            "device": device_id
        }), flush=True)

        SAMPLE_RATE = 16000

        try:
            with sd.InputStream(
                device=device_id,
                channels=1,
                samplerate=SAMPLE_RATE,
                callback=self.audio_callback
            ):
                self.process_queue()
        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)

    def run_stdin(self):
        print(json.dumps({
            "status": "ready",
            "model": self.model_size,
            "mode": "stdin"
        }), flush=True)

        SAMPLE_RATE = 16000
        CHUNK_SECONDS = 1.2

        accumulated = b""
        target_size = int(SAMPLE_RATE * 2 * CHUNK_SECONDS)

        try:
            while True:
                chunk = sys.stdin.buffer.read(4096)
                if not chunk:
                    break

                accumulated += chunk

                if len(accumulated) >= target_size:
                    to_process = accumulated[:target_size]
                    accumulated = accumulated[target_size:]

                    audio_np = (
                        np.frombuffer(to_process, dtype=np.int16)
                        .astype(np.float32) / 32768.0
                    )
                    self.process_audio(audio_np)

        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)

    def process_queue(self):
        accumulated_audio = []
        target_samples = 16000 * 3

        while True:
            try:
                chunk = self.audio_queue.get()
                accumulated_audio.append(chunk.flatten())

                total = sum(len(c) for c in accumulated_audio)
                if total >= target_samples:
                    audio_np = np.concatenate(accumulated_audio)
                    accumulated_audio = []
                    self.process_audio(audio_np)
            except Exception as e:
                print(json.dumps({"error": str(e)}), flush=True)

    def process_audio(self, audio_np):
        results, info = self.transcribe_chunk(audio_np)

        for res in results:
            print(json.dumps({
                "text": res["text"],
                "isFinal": True,
                "language": info.language if hasattr(info, "language") else self.language or "auto",
                "provider": "faster-whisper"
            }), flush=True)


def main():
    parser = argparse.ArgumentParser(description="Faster-Whisper Transcription Service")
    parser.add_argument("--model", default="base", help="Model size")
    parser.add_argument("--language", default=None, help="Language code (e.g. pt, en)")
    parser.add_argument("--device", default="cpu", help="Device to use (cpu, cuda, auto)")
    parser.add_argument("--device_id", type=int, help="Audio device ID for direct capture")
    parser.add_argument("--list_devices", action="store_true", help="List available audio devices")

    args = parser.parse_args()

    if args.list_devices:
        print(json.dumps(list_audio_devices()), flush=True)
        return

    service = WhisperService(
        model_size=args.model,
        language=args.language,
        device=args.device
    )

    if not service.load_model():
        return

    if args.device_id is not None:
        service.run_capture(args.device_id)
    else:
        service.run_stdin()


if __name__ == "__main__":
    signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))
    signal.signal(signal.SIGTERM, lambda s, f: sys.exit(0))
    main()
