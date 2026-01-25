import sounddevice as sd
import json

def list_devices():
    devices = sd.query_devices()
    hostapis = sd.query_hostapis()
    device_list = []

    for i, d in enumerate(devices):
        hostapi_name = hostapis[d['hostapi']]['name']
        device_list.append({
            "id": i,
            "name": d['name'],
            "hostapi": hostapi_name,
            "max_input_channels": d['max_input_channels'],
            "max_output_channels": d['max_output_channels'],
            "default_samplerate": d['default_samplerate']
        })

    print(json.dumps(device_list, indent=2))

if __name__ == "__main__":
    list_devices()
