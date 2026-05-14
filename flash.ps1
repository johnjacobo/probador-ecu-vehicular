$env:IDF_PATH = 'G:\Espressif\v5.4.4\esp-idf'
$env:PATH = "$env:PATH;G:\Espressif\tools\git\cmd;C:\Users\JACOB_PC\AppData\Local\Programs\Python\Python313;G:\Espressif\tools\cmake\3.30.2\bin;G:\Espressif\tools\ninja\1.12.1;G:\Espressif\tools\xtensa-esp-elf\esp-14.2.0_20260121\bin;G:\Espressif\tools\esp-clang\esp-18.1.2_20240912\bin"
$python = 'G:\Espressif\tools\python\v5.4.4\venv\Scripts\python.exe'
$idf_py = 'G:\Espressif\v5.4.4\esp-idf\tools\idf.py'

Write-Host "--- Iniciando Compilación y Grabación (Modo Seguro 115200) ---"
& $python $idf_py -p COM5 -b 115200 flash
