import json
log_path = r'C:\Users\JACOB_PC\.gemini\antigravity\brain\2980e9d9-3fe7-436d-b10c-66bdcfd770cf\.system_generated\logs\overview.txt'
with open(log_path, 'r', encoding='utf-8') as f:
    line = f.readlines()[1008]
    data = json.loads(line)
    content = data['tool_calls'][0]['args']['CodeContent']
    real_content = json.loads(content)
    with open(r'C:\Users\JACOB_PC\.gemini\antigravity\scratch\probador-ecu-vehicular\web_app\app.js', 'w', encoding='utf-8') as out:
        out.write(real_content)
