const get = (id) => document.getElementById(id);

// CONFIGURACIÓN DE COMUNICACIÓN (RESTAURADA)
const SERVICE_UUID = '12345678-9abc-def0-1234-56789abcdef0';
const CHAR_UUID    = '01020304-0506-0708-090a-0b0c0d0e0f10';

let device, characteristic;
let isConnected = false;
let engineOn = false;

function log(msg) {
    const console = get('log-console');
    if (!console) return;
    const time = new Date().toLocaleTimeString();
    console.innerHTML += `<div>[${time}] ${msg}</div>`;
    console.scrollTop = console.scrollHeight;
}

async function onConnect() {
    try {
        log("Buscando dispositivo...");
        device = await navigator.bluetooth.requestDevice({
            filters: [{ name: 'PRO-ECU-TESTER' }],
            optionalServices: [SERVICE_UUID]
        });

        log("Estableciendo conexión...");
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(SERVICE_UUID);
        characteristic = await service.getCharacteristic(CHAR_UUID);

        isConnected = true;
        updateUI();
        log("SISTEMA ONLINE");
    } catch (error) {
        log("ERROR BLE: " + error);
    }
}

function updateUI() {
    const statusDot = get('status-dot');
    const statusText = get('status-text');
    const connectBtn = get('connect-btn');
    const tachoImg = get('tacho-img');

    if (isConnected) {
        statusDot.style.background = '#00ff88';
        statusText.innerText = 'ONLINE';
        connectBtn.innerText = 'TERMINAR';
        tachoImg.style.filter = 'none';
        document.body.style.filter = 'none';
    } else {
        statusDot.style.background = '#444';
        statusText.innerText = 'OFFLINE';
        connectBtn.innerText = 'ESCANEAR';
        tachoImg.style.filter = 'grayscale(1) brightness(0.3)';
        document.body.style.filter = 'grayscale(0.5)';
    }
}

function updateTacho(value) {
    const needle = get('tacho-needle');
    const display = get('rpm-display');
    const angle = (value / 8000 * 270) - 135;
    needle.style.transform = `translateX(-50%) rotate(${angle}deg)`;
    display.innerText = value;
}

get('rpm-slider').oninput = async (e) => {
    const val = parseInt(e.target.value);
    updateTacho(val);
    if (isConnected && characteristic) {
        try {
            const data = new Uint8Array([
                (val >> 8) & 0xFF,
                val & 0xFF,
                60, 2,
                engineOn ? 1 : 0
            ]);
            await characteristic.writeValue(data);
        } catch(e) {}
    }
};

get('engine-btn').onclick = async () => {
    engineOn = !engineOn;
    get('engine-btn').classList.toggle('active', engineOn);
    log(engineOn ? "MOTOR ENCENDIDO" : "MOTOR APAGADO");
    
    if (isConnected && characteristic) {
        try {
            const val = parseInt(get('rpm-slider').value);
            const data = new Uint8Array([
                (val >> 8) & 0xFF,
                val & 0xFF,
                60, 2,
                engineOn ? 1 : 0
            ]);
            await characteristic.writeValue(data);
        } catch(e) {}
    }
};

async function setPattern(total, missing, el, label) {
    document.querySelectorAll('.btn-premium').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    log(`PATRÓN SELECCIONADO: ${label}`);
    
    if (isConnected && characteristic) {
        try {
            const val = parseInt(get('rpm-slider').value);
            const data = new Uint8Array([
                (val >> 8) & 0xFF,
                val & 0xFF,
                total,
                missing,
                engineOn ? 1 : 0
            ]);
            await characteristic.writeValue(data);
        } catch(e) {}
    }
}

get('connect-btn').onclick = () => {
    if (!isConnected) onConnect();
    else {
        device.gatt.disconnect();
        isConnected = false;
        updateUI();
    }
};

// Init
updateTacho(1050);
window.setPattern = setPattern;
updateUI();