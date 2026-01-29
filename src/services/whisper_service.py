import sys
import json
import numpy as np
import signal
import argparse
import queue
from faster_whisper import WhisperModel

try:
    import sounddevice as sd
    HAS_SOUNDDEVICE = True
except ImportError:
    HAS_SOUNDDEVICE = False

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
    def __init__(
        self,
        model_size="base",
        device="auto",
        compute_type="float16",
        language=None,
        queue_maxsize=32,
        sample_rate=16000,
        capture_chunk_seconds=3.0,
        stdin_chunk_seconds=1.2,
        beam_size=10,
        vad_filter=True,
        vad_min_silence_duration_ms=300,
        condition_on_previous_text=False,
        temperature=0.0,
        log_prob_threshold=-1.0,
        no_speech_threshold=0.6,
        compression_ratio_threshold=2.4,
        merge_gap_s=0.8,
        initial_prompt=None
    ):
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.language = language

        self.sample_rate = int(sample_rate)
        self.capture_chunk_seconds = float(capture_chunk_seconds)
        self.stdin_chunk_seconds = float(stdin_chunk_seconds)

        self.beam_size = int(beam_size)
        self.vad_filter = bool(vad_filter)
        self.vad_min_silence_duration_ms = int(vad_min_silence_duration_ms)
        self.condition_on_previous_text = bool(condition_on_previous_text)
        self.temperature = float(temperature)

        self.log_prob_threshold = log_prob_threshold
        self.no_speech_threshold = no_speech_threshold
        self.compression_ratio_threshold = compression_ratio_threshold

        self.merge_gap_s = float(merge_gap_s)
        self.initial_prompt = initial_prompt

        self.model = None
        self.audio_queue = queue.Queue(maxsize=int(queue_maxsize))
        self.last_text = ""
        self.stop_requested = False

    def request_stop(self):
        self.stop_requested = True

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

    def _transcribe_with_fallback(self, audio_data):
        if self.model is None:
            raise RuntimeError("Model not loaded")

        attempt = 0
        while True:
            try:
                kwargs = dict(
                    beam_size=self.beam_size,
                    language=self.language,
                    temperature=self.temperature,
                    vad_filter=self.vad_filter,
                    vad_parameters=dict(min_silence_duration_ms=self.vad_min_silence_duration_ms),
                    task="transcribe",
                    condition_on_previous_text=self.condition_on_previous_text,
                    initial_prompt=self.initial_prompt
                )

                if self.log_prob_threshold is not None:
                    kwargs["log_prob_threshold"] = self.log_prob_threshold
                if self.no_speech_threshold is not None:
                    kwargs["no_speech_threshold"] = self.no_speech_threshold
                if self.compression_ratio_threshold is not None:
                    kwargs["compression_ratio_threshold"] = self.compression_ratio_threshold

                segments, info = self.model.transcribe(audio_data, **kwargs)
                return segments, info

            except Exception as e:
                error_msg = str(e)
                is_cuda_like = (
                    ("dll" in error_msg.lower() or
                     "cublas" in error_msg.lower() or
                     "library" in error_msg.lower())
                    and self.device in ("cuda", "auto")
                )

                if is_cuda_like and attempt == 0:
                    print(json.dumps({
                        "status": "fallback_cpu",
                        "message": f"CUDA Error: {error_msg}. Switching to CPU..."
                    }), flush=True)
                    self.device = "cpu"
                    self.compute_type = "int8"
                    self.model = WhisperModel(
                        self.model_size,
                        device="cpu",
                        compute_type="int8"
                    )
                    attempt += 1
                    continue

                raise

    def transcribe_chunk(self, audio_data):
        segments, info = self._transcribe_with_fallback(audio_data)

        hallucinations = [
            "Obrigado.", "Obrigado!", "Tchau.", "Tchau!",
            "Obrigado por assistir.", "Legenda por",
            "Amara.org", "Sous-titres", "Untertitel",
            "subtitle", "caption"
        ]

        results = []
        for segment in segments:
            text = (segment.text or "").strip()

            if not text or len(text) < 2:
                continue

            t_lower = text.lower()
            if any(h.lower() in t_lower for h in hallucinations):
                continue

            if len(text) > 10 and text == self.last_text:
                continue

            if getattr(segment, "avg_logprob", 0.0) < -1.0:
                continue

            if results:
                last = results[-1]
                gap = float(segment.start) - float(last["end"])

                if gap < self.merge_gap_s and not last["text"].endswith((".", "?", "!", ":")):
                    last["text"] += " " + text
                    last["end"] = float(segment.end)
                    self.last_text = last["text"]
                    continue

            results.append({
                "text": text,
                "start": float(segment.start),
                "end": float(segment.end),
                "probability": float(getattr(segment, "avg_logprob", 0.0))
            })

            self.last_text = text

        return results, info

    def audio_callback(self, indata, frames, time_info, status):
        if status:
            print(str(status), file=sys.stderr)
        try:
            self.audio_queue.put_nowait(indata.copy())
        except queue.Full:
            try:
                _ = self.audio_queue.get_nowait()
            except Exception:
                return
            try:
                self.audio_queue.put_nowait(indata.copy())
            except Exception:
                return

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

        target_samples = int(self.sample_rate * self.capture_chunk_seconds)
        accumulated_audio = []
        accumulated_len = 0

        try:
            with sd.InputStream(
                device=device_id,
                channels=1,
                samplerate=self.sample_rate,
                dtype="float32",
                callback=self.audio_callback
            ):
                while not self.stop_requested:
                    try:
                        chunk = self.audio_queue.get(timeout=0.5)
                    except queue.Empty:
                        continue

                    flat = chunk.reshape(-1)
                    accumulated_audio.append(flat)
                    accumulated_len += len(flat)

                    if accumulated_len >= target_samples:
                        audio_np = np.concatenate(accumulated_audio, axis=0)
                        accumulated_audio = []
                        accumulated_len = 0
                        self.process_audio(audio_np)

        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)

    def run_stdin(self):
        print(json.dumps({
            "status": "ready",
            "model": self.model_size,
            "mode": "stdin"
        }), flush=True)

        accumulated = b""
        target_size = int(self.sample_rate * 2 * self.stdin_chunk_seconds)

        try:
            while not self.stop_requested:
                chunk = sys.stdin.buffer.read(4096)
                if not chunk:
                    break

                accumulated += chunk

                if len(accumulated) >= target_size:
                    to_process = accumulated[:target_size]
                    accumulated = accumulated[target_size:]

                    audio_np = np.frombuffer(to_process, dtype=np.int16).astype(np.float32) / 32768.0
                    self.process_audio(audio_np)

        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)

    def process_audio(self, audio_np):
        results, info = self.transcribe_chunk(audio_np)

        lang = None
        try:
            lang = info.language
        except Exception:
            lang = None

        for res in results:
            print(json.dumps({
                "text": res["text"],
                "isFinal": True,
                "language": lang or self.language or "auto",
                "provider": "faster-whisper"
            }), flush=True)


def main():
    parser = argparse.ArgumentParser(description="Faster-Whisper Transcription Service")
    parser.add_argument("--model", default="base", help="Model size")
    parser.add_argument("--language", default=None, help="Language code (e.g. pt, en)")
    parser.add_argument("--device", default="cpu", help="Device to use (cpu, cuda, auto)")
    parser.add_argument("--compute_type", default="int8", help="Compute type (e.g. int8, float16)")
    parser.add_argument("--device_id", type=int, default=None, help="Audio device ID for direct capture")
    parser.add_argument("--list_devices", action="store_true", help="List available audio devices")
    parser.add_argument("--queue_maxsize", type=int, default=32, help="Max queued audio blocks")
    parser.add_argument("--capture_chunk_seconds", type=float, default=3.0, help="Chunk size for capture mode (seconds)")
    parser.add_argument("--stdin_chunk_seconds", type=float, default=1.2, help="Chunk size for stdin mode (seconds)")
    parser.add_argument("--initial_prompt", default=None, help="Initial prompt for transcription")

    args = parser.parse_args()

    if args.list_devices:
        print(json.dumps(list_audio_devices()), flush=True)
        return

    service = WhisperService(
        model_size=args.model,
        language=args.language,
        device=args.device,
        compute_type=args.compute_type,
        queue_maxsize=args.queue_maxsize,
        capture_chunk_seconds=args.capture_chunk_seconds,
        stdin_chunk_seconds=args.stdin_chunk_seconds,
        initial_prompt=args.initial_prompt
    )

    def _handle_exit(sig, frame):
        service.request_stop()
        raise SystemExit(0)

    signal.signal(signal.SIGINT, _handle_exit)
    signal.signal(signal.SIGTERM, _handle_exit)

    if not service.load_model():
        return

    if args.device_id is not None:
        service.run_capture(args.device_id)
    else:
        service.run_stdin()


if __name__ == "__main__":
    main()
