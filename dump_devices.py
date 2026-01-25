import json
import pyaudiowpatch as pyaudio

def dump_devices():
    p = pyaudio.PyAudio()
    devs = []
    for i in range(p.get_device_count()):
        try:
            info = p.get_device_info_by_index(i)
            devs.append(info)
        except Exception as e:
            devs.append({"index": i, "error": str(e)})
    
    with open('full_devices.json', 'w', encoding='utf-8') as f:
        json.dump(devs, f, indent=2)
    
    p.terminate()

if __name__ == "__main__":
    dump_devices()
