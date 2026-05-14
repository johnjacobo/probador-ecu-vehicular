import json
import os

log_path = r'C:\Users\JACOB_PC\.gemini\antigravity\brain\2980e9d9-3fe7-436d-b10c-66bdcfd770cf\.system_generated\logs\overview.txt'
web_app_dir = r'C:\Users\JACOB_PC\.gemini\antigravity\scratch\probador-ecu-vehicular\web_app'

def restore_file(line_idx, target_filename):
    with open(log_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        data = json.loads(lines[line_idx])
        content = data['tool_calls'][0]['args']['CodeContent']
        
        # Double decode if necessary
        if isinstance(content, str) and content.startswith('"'):
            try:
                content = json.loads(content)
            except:
                pass
        
        with open(os.path.join(web_app_dir, target_filename), 'w', encoding='utf-8', newline='') as out:
            out.write(content)
        print(f"Restored {target_filename} from line {line_idx+1}")

restore_file(762, 'index.html')
restore_file(1008, 'app.js')
