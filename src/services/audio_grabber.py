"""
Audio Grabber - WASAPI Loopback for System Audio Capture
Uses pyaudiowpatch for true "what you hear" recording on Windows
"""
import sys
import json
import argparse
import signal

# Ensure unbuffered output for binary streaming
# sys.stdout.reconfigure(line_buffering=True) -- REMOVED: Interferes with binary data on some Windows shells

try:
    import pyaudiowpatch as pyaudio
    HAS_LOOPBACK = True
except ImportError:
    HAS_LOOPBACK = False
    import pyaudio  # Fallback to regular pyaudio

def list_devices():
    """List available audio devices with loopback info"""
    p = pyaudio.PyAudio()
    device_list = []
    
    try:
        # Get WASAPI host API info
        wasapi_info = None
        for i in range(p.get_host_api_count()):
            info = p.get_host_api_info_by_index(i)
            if info['name'] == 'Windows WASAPI':
                wasapi_info = info
                break
        
        for i in range(p.get_device_count()):
            dev = p.get_device_info_by_index(i)
            is_loopback = False
            
            # Determine device types
            device_type = "unknown"
            is_loopback = HAS_LOOPBACK and dev.get('isLoopbackDevice', False)
            
            if is_loopback:
                device_type = "loopback"
            elif dev.get('maxInputChannels', 0) > 0 and dev.get('maxOutputChannels', 0) == 0:
                device_type = "input"
            elif dev.get('maxOutputChannels', 0) > 0 and dev.get('maxInputChannels', 0) == 0:
                device_type = "output"
            elif dev.get('maxOutputChannels', 0) > 0 and dev.get('maxInputChannels', 0) > 0:
                # Duplex device
                device_type = "duplex"

            device_list.append({
                "id": i,
                "name": dev['name'],
                "type": device_type,
                "hostapi": dev.get('hostApi', -1),
                "max_input_channels": dev.get('maxInputChannels', 0),
                "max_output_channels": dev.get('maxOutputChannels', 0),
                "is_loopback": is_loopback,
                "default_samplerate": int(dev.get('defaultSampleRate', 16000))
            })
    finally:
        p.terminate()
    
    print(json.dumps(device_list))

def get_default_loopback_device():
    """Find the default speaker's loopback device"""
    p = pyaudio.PyAudio()
    
    try:
        # Get default WASAPI output device
        wasapi_info = None
        for i in range(p.get_host_api_count()):
            info = p.get_host_api_info_by_index(i)
            if 'WASAPI' in info['name']:
                wasapi_info = info
                break
        
        if wasapi_info is None:
            return None, None, None
        
        # Get the default output device for WASAPI
        default_output_idx = wasapi_info.get('defaultOutputDevice', -1)
        if default_output_idx < 0:
            return None, None, None
        
        default_output = p.get_device_info_by_index(default_output_idx)
        
        # Try to get loopback device for this output
        if HAS_LOOPBACK:
            try:
                loopback = p.get_loopback_device_info_generator()
                for dev in loopback:
                    # Match by name
                    if default_output['name'] in dev['name']:
                        return dev['index'], dev['maxInputChannels'], int(dev['defaultSampleRate'])
            except:
                pass
        
        # Fallback: return the output device itself (might work on some setups)
        return default_output_idx, default_output.get('maxInputChannels', 2), int(default_output.get('defaultSampleRate', 44100))
        
    finally:
        p.terminate()

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

def capture_loopback(device_id=None, sample_rate=16000, channels=1):
    """Capture audio from loopback device and write to stdout"""
    p = pyaudio.PyAudio()
    
    try:
        if device_id is None:
            device_id, max_channels, native_rate = get_default_loopback_device()
            if device_id is None:
                print(json.dumps({"error": "No loopback device found"}), file=sys.stderr)
                return
        
        device_info = p.get_device_info_by_index(device_id)
        
        # Use device's native sample rate for best compatibility
        native_rate = int(device_info.get('defaultSampleRate', 16000))
        TARGET_RATE = 16000

        # Use device's native channel count to avoid WASAPI errors or bad downmixing
        native_channels = int(device_info.get('maxInputChannels', 2))
        # Fallback to stereo if 0 (sometimes happens with loopback descriptions)
        if native_channels == 0: native_channels = 2
        
        CHUNK = 1024
        # Adjust chunk size to ensure sufficient data if resampling
        if native_rate > TARGET_RATE:
             CHUNK = int(1024 * (native_rate / TARGET_RATE))
             
        FORMAT = pyaudio.paInt16
        
        # Retry logic for channels (some drivers are picky)
        stream = None
        last_error = None
        
        # Try a wider range of channel counts. 
        # Many loopback drivers require the exact number of channels the output is using (e.g. 2, 6, 8)
        # We start with native, then common pairs, then higher counts.
        retry_channels = [native_channels, 2, 1]
        for c in [4, 6, 8]:
            if c not in retry_channels:
                retry_channels.append(c)

        for try_channels in retry_channels:
            try:
                # Some WASAPI loopback devices require specific channel counts
                stream = p.open(
                    format=FORMAT,
                    channels=try_channels,
                    rate=native_rate,
                    input=True,
                    input_device_index=device_id,
                    frames_per_buffer=CHUNK
                )
                native_channels = try_channels # Update for downstream processing
                break
            except Exception as e:
                last_error = str(e)
                # Only print specific error for the first failure or if it's the native count
                if try_channels == native_channels or try_channels == retry_channels[0]:
                    print(json.dumps({"info": f"Failed to open with {try_channels} channels: {last_error}"}), file=sys.stderr)
                continue
        
        if stream is None:
            raise Exception(f"Could not open audio stream after retrying channels {retry_channels}. Last error: {last_error}")
        
        status_msg = {
            "status": "capturing", 
            "device": device_info['name'], 
            "rate": native_rate, 
            "channels": native_channels
        }
        
        if native_rate != TARGET_RATE:
            status_msg["resampling_to"] = TARGET_RATE
        
        print(json.dumps(status_msg), file=sys.stderr)
        
        while True:
            data = stream.read(CHUNK, exception_on_overflow=False)
            
            if HAS_NUMPY:
                audio_data = np.frombuffer(data, dtype=np.int16)
                
                # Reshape to (samples, channels)
                if native_channels > 1:
                    # Check if data length matches channels
                    if len(audio_data) % native_channels == 0:
                        audio_data = audio_data.reshape(-1, native_channels)
                        # Downmix to mono (average)
                        audio_data = audio_data.mean(axis=1).astype(np.int16)
                    else:
                        # Fallback: take first channel strided
                        audio_data = audio_data[::native_channels]

                # Resample if needed
                if native_rate != TARGET_RATE:
                    # Calculate new length based on ratio
                    ratio = TARGET_RATE / native_rate
                    new_length = int(len(audio_data) * ratio)
                    
                    # Interpolate
                    x_old = np.linspace(0, 1, len(audio_data))
                    x_new = np.linspace(0, 1, new_length)
                    
                    resampled = np.interp(x_new, x_old, audio_data)
                    data = resampled.astype(np.int16).tobytes()
                else:
                    data = audio_data.tobytes()
            
            sys.stdout.buffer.write(data)
            sys.stdout.buffer.flush()
            
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
    finally:
        if 'stream' in locals() and stream is not None:
            stream.stop_stream()
            stream.close()
        p.terminate()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--list", action="store_true", help="List audio devices")
    parser.add_argument("--device", type=int, default=None, help="Device ID")
    parser.add_argument("--samplerate", type=int, default=16000)
    parser.add_argument("--channels", type=int, default=1)
    args = parser.parse_args()
    
    if args.list:
        list_devices()
        return
    
    capture_loopback(args.device, args.samplerate, args.channels)

if __name__ == "__main__":
    signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))
    signal.signal(signal.SIGTERM, lambda s, f: sys.exit(0))
    main()
