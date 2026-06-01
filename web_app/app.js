const get = (id) => document.getElementById(id);

// Soporte de simulación Bluetooth offline para entornos locales o de prueba
if (!navigator.bluetooth || window.location.protocol === 'file:') {
    navigator.bluetooth = {
        requestDevice: async function() {
            // Simulamos un retraso de búsqueda para conservar la autenticidad visual
            await new Promise(resolve => setTimeout(resolve, 800));
            return {
                name: 'PRO-ECU-TESTER (SIMULADO)',
                gatt: {
                    connect: async function() {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        return {
                            getPrimaryService: async function() {
                                return {
                                    getCharacteristic: async function() {
                                        return {
                                            writeValue: async function(data) {
                                                console.log("BLE Simulado (Envío):", data);
                                                return Promise.resolve();
                                            }
                                        };
                                    }
                                };
                            }
                        };
                    }
                }
            };
        }
    };
}

const SERVICE_UUID = '12345678-9abc-def0-1234-56789abcdef0';
const CHAR_UUID    = '01020304-0506-0708-090a-0b0c0d0e0f10';

let device, characteristic;
let isConnected = false;
let isEngineActive = false;
let isCranking = false;
let rpmInterval = null;

async function onConnect() {
    const statusMsg = get('status-msg');
    const mainBtn = get('main-action-btn');
    const bar = get('connection-bar');
    
    try {
        statusMsg.innerText = "BUSCANDO DISPOSITIVO...";
        mainBtn.innerText = "...";
        
        device = await navigator.bluetooth.requestDevice({
            filters: [{ name: 'PRO-ECU-TESTER' }],
            optionalServices: [SERVICE_UUID]
        });

        // Registrar evento de desconexión automática si el dispositivo se apaga o pierde señal
        device.addEventListener('gattserverdisconnected', onDisconnect);

        statusMsg.innerText = "ESTABLECIENDO ENLACE...";
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(SERVICE_UUID);
        characteristic = await service.getCharacteristic(CHAR_UUID);

        isConnected = true;
        
        // Cambiar estado visual de la barra a conectado
        bar.classList.add('connected');
        statusMsg.innerText = "SISTEMA ONLINE - CONECTADO";
        mainBtn.innerText = "DESCONECTAR";
        
        // Revelar dashboard futuro
        document.body.classList.add('dashboard-active');
        get('dashboard-content').classList.remove('disabled-dashboard');
        get('dashboard-content').classList.add('active-dashboard');

        // Inicializar estado del motor apagado (requiere dar START)
        isEngineActive = false;
        isCranking = false;
        rpmSlider.disabled = true;
        rpmSlider.value = 0;
        rpmSlider.min = 0;
        updateTacho(0);
        const startBezel = document.querySelector('.start-btn-bezel');
        if (startBezel) {
            startBezel.classList.remove('engine-active', 'engine-cranking');
        }
        get('dashboard-content').classList.remove('engine-on');

    } catch (error) {
        console.error("ERROR DE CONEXIÓN BLUETOOTH:", error);
        
        isConnected = false;
        
        // Cambiar estado visual de la barra a desconectado con mensaje de error
        bar.classList.remove('connected');
        statusMsg.innerText = "ERROR: DISPOSITIVO NO DETECTADO";
        mainBtn.innerText = "ESCANEAR";
        
        // Mantener/restaurar dashboard deshabilitado
        document.body.classList.remove('dashboard-active');
        get('dashboard-content').classList.remove('active-dashboard');
        get('dashboard-content').classList.add('disabled-dashboard');
        
        alert("No se pudo conectar con el dispositivo. Asegúrate de que el PRO-ECU-TESTER esté encendido y que el Bluetooth esté activo en tu equipo.");
    }
}

function onDisconnect() {
    if (device && device.gatt.connected) {
        device.gatt.disconnect();
    }
    isConnected = false;
    
    const statusMsg = get('status-msg');
    const mainBtn = get('main-action-btn');
    const bar = get('connection-bar');
    
    // Regresar estado visual de la barra a desconectado
    bar.classList.remove('connected');
    statusMsg.innerText = "SISTEMA DESCONECTADO";
    mainBtn.innerText = "ESCANEAR";
    
    // Ocultar dashboard
    document.body.classList.remove('dashboard-active');
    get('dashboard-content').classList.remove('active-dashboard');
    get('dashboard-content').classList.add('disabled-dashboard');

    // Restablecer estado del motor
    isEngineActive = false;
    isCranking = false;
    if (rpmInterval) clearInterval(rpmInterval);
    rpmSlider.disabled = true;
    rpmSlider.value = 0;
    rpmSlider.min = 0;
    updateTacho(0);
    const startBezel = document.querySelector('.start-btn-bezel');
    if (startBezel) {
        startBezel.classList.remove('engine-active', 'engine-cranking');
    }
    get('dashboard-content').classList.remove('engine-on');
}

get('main-action-btn').onclick = () => {
    if (!isConnected) {
        onConnect();
    } else {
        onDisconnect();
    }
};

/* ========================================================
   LÓGICA DEL TACÓMETRO Y SLIDER DE RPM
   ======================================================== */
const rpmSlider = get('rpm-slider');
const rpmVal = get('rpm-val');
const tachoNeedle = get('tacho-needle');

// Rango del tacómetro gráfico calibrado para la imagen (en CSS 0deg es a las 3 en punto):
const MAX_RPM = 8000;
const MIN_DEG = 135;  // 7:30 en punto (apunta al "0" de tu imagen real)
const MAX_DEG = 405;  // 4:30 en punto (apunta al "8000" tras dar la vuelta)

function updateTacho(rpm) {
    rpmVal.innerText = rpm;
    
    // Calcular ángulo
    const percentage = rpm / MAX_RPM;
    const degree = MIN_DEG + (percentage * (MAX_DEG - MIN_DEG));
    
    // Aplicar solo rotación (el centrado ya lo hace el CSS)
    tachoNeedle.style.transform = `rotate(${degree}deg)`;
    
    // Efecto visual: Zona Roja (> 4000 RPM)
    const dashboard = get('dashboard-content');
    if (rpm > 4000) {
        dashboard.classList.add('danger-zone');
    } else {
        dashboard.classList.remove('danger-zone');
    }
    
    // Hacer titilar el LED del botón activo si RPM > 0 y el motor está encendido/arrancando
    const activeBtn = document.querySelector('.cyber-btn.active');
    if (activeBtn) {
        if (rpm > 0 && (isEngineActive || isCranking)) {
            activeBtn.classList.add('running');
            // Calcular velocidad de parpadeo (entre 0.6s para ralentí y 0.04s para 8000 RPM)
            const blinkSpeed = Math.max(0.04, 0.6 - (percentage * 0.56));
            activeBtn.style.setProperty('--blink-speed', `${blinkSpeed}s`);
            
            // Ajustar dinámicamente la velocidad de animación de los iconos según RPM
            const spinSpeed = Math.max(0.15, 3.0 - (percentage * 2.85));
            const pulseSpeed = Math.max(0.15, 1.0 - (percentage * 0.85));
            const wiggleSpeed = Math.max(0.08, 0.5 - (percentage * 0.42));
            const floatSpeed = Math.max(0.3, 2.0 - (percentage * 1.7));
            
            activeBtn.style.setProperty('--spin-speed', `${spinSpeed}s`);
            activeBtn.style.setProperty('--pulse-speed', `${pulseSpeed}s`);
            activeBtn.style.setProperty('--wiggle-speed', `${wiggleSpeed}s`);
            activeBtn.style.setProperty('--float-speed', `${floatSpeed}s`);
        } else {
            activeBtn.classList.remove('running');
        }
    }
}

// Enviar datos por Bluetooth si está conectado
async function sendState() {
    if (!isConnected || !characteristic) return;
    const rpm = parseInt(rpmSlider.value);
    
    // Mapear el identificador de texto a un ID de señal de 1 byte (0-5)
    let signalId = 0;
    switch (currentSignal) {
        case 'ckp':  signalId = 0; break;
        case 'hall': signalId = 1; break;
        case 'cmp':  signalId = 2; break;
        case 'aux3': signalId = 3; break;
        case 'aux4': signalId = 4; break;
        case 'aux5': signalId = 5; break;
    }
    
    // Obtener los dientes (N) y faltantes (M) según la señal
    let teeth = 60;
    let missing = 2;
    
    if (currentSignal === 'ckp') {
        const activeId = localStorage.getItem('active_ckp_id') || 'bosch';
        const sigArray = JSON.parse(localStorage.getItem('ckp_signals')) || DEFAULT_CKP_SIGNALS;
        const activeSig = sigArray.find(s => s.id === activeId);
        if (activeSig) {
            teeth = activeSig.teeth || (activeId === 'ford' || activeId === 'toyota' ? 36 : 60);
            missing = activeSig.missing !== undefined ? activeSig.missing : (activeId === 'ford' ? 1 : 2);
        }
    } else {
        // Señales simples sin dientes faltantes
        teeth = 1;
        missing = 0;
    }
    
    try {
        const data = new Uint8Array(5);
        data[0] = rpm & 0xFF;         // Byte 0: RPM Bajo
        data[1] = (rpm >> 8) & 0xFF;  // Byte 1: RPM Alto
        data[2] = signalId;           // Byte 2: ID de Señal (0 a 5)
        data[3] = teeth;              // Byte 3: Dientes N
        data[4] = missing;            // Byte 4: Faltantes M
        
        await characteristic.writeValue(data);
        console.log(`Enviado BLE: RPM=${rpm}, Señal=${currentSignal} (ID=${signalId}), Dientes=${teeth}, Faltantes=${missing}`);
    } catch (error) {
        console.error("Error enviando estado BLE:", error);
    }
}

// Evento al mover el slider
rpmSlider.addEventListener('input', (e) => {
    let rpm = parseInt(e.target.value);
    if (isEngineActive && rpm < 900) {
        rpm = 900;
        rpmSlider.value = 900;
    }
    updateTacho(rpm);
    sendState(); // Transmite el nuevo estado
});

/* ========================================================
   GESTIÓN DE SEÑALES CKP Y MODAL PERSONALIZABLE
   ======================================================== */
const DEFAULT_CKP_SIGNALS = [
    { id: 'bosch', name: 'BOSCH 60-2', desc: '60-2 DIENTES', isDefault: true, teeth: 60, missing: 2 },
    { id: 'ford', name: 'FORD 36-1', desc: '36-1 DIENTES', isDefault: true, teeth: 36, missing: 1 },
    { id: 'toyota', name: 'TOYOTA 36-2', desc: '36-2 DIENTES', isDefault: true, teeth: 36, missing: 2 }
];

function initCkpSignals() {
    if (!localStorage.getItem('ckp_signals')) {
        localStorage.setItem('ckp_signals', JSON.stringify(DEFAULT_CKP_SIGNALS));
    }
    if (!localStorage.getItem('active_ckp_id')) {
        localStorage.setItem('active_ckp_id', 'bosch');
    }
}

function renderCkpSignals() {
    const listContainer = get('ckp-signals-list');
    if (!listContainer) return;
    
    const sigArray = JSON.parse(localStorage.getItem('ckp_signals')) || DEFAULT_CKP_SIGNALS;
    const activeId = localStorage.getItem('active_ckp_id') || 'bosch';
    
    listContainer.innerHTML = '';
    
    sigArray.forEach(sig => {
        const item = document.createElement('div');
        item.className = `ckp-signal-item ${sig.id === activeId ? 'active' : ''}`;
        
        item.innerHTML = `
            <div class="sig-info-left" style="flex: 1;" onclick="selectCkpSignal('${sig.id}')">
                <span class="sig-name">${sig.name}</span>
                <span class="sig-desc">${sig.desc}</span>
            </div>
            ${!sig.isDefault ? `<button class="del-sig-btn" onclick="deleteCkpSignal(event, '${sig.id}')">&times;</button>` : ''}
        `;
        listContainer.appendChild(item);
    });
}

window.selectCkpSignal = function(id) {
    localStorage.setItem('active_ckp_id', id);
    const sigArray = JSON.parse(localStorage.getItem('ckp_signals')) || DEFAULT_CKP_SIGNALS;
    const selected = sigArray.find(s => s.id === id) || sigArray[0];
    
    const ckpBtn = document.querySelector('[data-signal="ckp"]');
    if (ckpBtn) {
        const descEl = ckpBtn.querySelector('.btn-desc');
        if (descEl) descEl.innerText = selected.name;
    }
    
    renderCkpSignals();
    sendState();
    closeCkpModal();
};

function showCyberConfirm(message, onConfirm) {
    const modal = get('cyber-confirm-modal');
    const msgEl = get('cyber-confirm-message');
    const btnCancel = get('cyber-confirm-cancel');
    const btnAccept = get('cyber-confirm-accept');
    
    if (!modal || !msgEl || !btnCancel || !btnAccept) return;
    
    msgEl.innerText = message;
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
    
    const closeConfirm = () => {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    };
    
    btnCancel.onclick = () => {
        closeConfirm();
    };
    
    btnAccept.onclick = () => {
        closeConfirm();
        onConfirm();
    };
}

window.deleteCkpSignal = function(event, id) {
    event.stopPropagation();
    
    console.log("[LOG-DELETE] Intento de eliminar señal con ID:", id);
    
    let sigArray = JSON.parse(localStorage.getItem('ckp_signals')) || DEFAULT_CKP_SIGNALS;
    const signalToDelete = sigArray.find(s => s.id === id);
    const signalName = signalToDelete ? signalToDelete.name : "esta señal";
    
    showCyberConfirm(`¿Está seguro de que desea eliminar la señal "${signalName}" de forma permanente?`, () => {
        console.log("[LOG-DELETE] Confirmación aceptada. Eliminando:", signalName);
        
        const activeId = localStorage.getItem('active_ckp_id') || 'bosch';
        
        if (id === activeId) {
            console.log("[LOG-DELETE] La señal activa está siendo eliminada. Restableciendo a bosch por defecto.");
            localStorage.setItem('active_ckp_id', 'bosch');
            const selected = sigArray.find(s => s.id === 'bosch');
            const ckpBtn = document.querySelector('[data-signal="ckp"]');
            if (ckpBtn) {
                const descEl = ckpBtn.querySelector('.btn-desc');
                if (descEl) {
                    descEl.innerText = selected ? selected.name : 'BOSCH 60-2';
                }
            }
        }
        
        // Guardar array filtrado
        sigArray = sigArray.filter(s => s.id !== id);
        localStorage.setItem('ckp_signals', JSON.stringify(sigArray));
        console.log("[LOG-DELETE] Guardado exitoso en localStorage. Actualizando interfaz...");
        
        renderCkpSignals();
        sendState();
    });
};

function openCkpModal() {
    const panel = get('ckp-floating-panel');
    if (!panel) return;
    
    // Asegurar que abrimos en la vista de listado
    if (get('ckp-list-view')) get('ckp-list-view').style.display = 'block';
    if (get('ckp-add-view')) get('ckp-add-view').style.display = 'none';
    
    panel.style.display = 'block';
    setTimeout(() => panel.classList.add('show'), 10);
    renderCkpSignals();
}

function closeCkpModal() {
    const panel = get('ckp-floating-panel');
    if (!panel) return;
    panel.classList.remove('show');
    setTimeout(() => panel.style.display = 'none', 300);
}

// Vinculación de eventos de cierre y agregar
if (get('close-panel-btn')) {
    get('close-panel-btn').onclick = closeCkpModal;
}

// Navegación entre pantallas del modal de CKP
if (get('go-to-add-btn')) {
    get('go-to-add-btn').onclick = () => {
        if (get('ckp-list-view')) get('ckp-list-view').style.display = 'none';
        if (get('ckp-add-view')) get('ckp-add-view').style.display = 'block';
    };
}

if (get('back-to-list-btn')) {
    get('back-to-list-btn').onclick = () => {
        if (get('ckp-list-view')) get('ckp-list-view').style.display = 'block';
        if (get('ckp-add-view')) get('ckp-add-view').style.display = 'none';
    };
}

// Cerrar automáticamente cuando el mouse sale de la columna de controles (pero solo en el listado, no mientras escribe)
const ckpPanel = get('ckp-floating-panel');
const signalControls = document.querySelector('.signal-controls');
if (signalControls) {
    signalControls.onmouseleave = () => {
        if (ckpPanel && ckpPanel.classList.contains('show')) {
            const listView = get('ckp-list-view');
            // Solo cerramos si el listado está activo (no si está rellenando el formulario de nueva señal)
            if (listView && listView.style.display !== 'none') {
                closeCkpModal();
            }
        }
    };
}

if (get('add-signal-btn')) {
    get('add-signal-btn').onclick = function() {
        const brandInput = get('new-signal-brand');
        const teethInput = get('new-signal-teeth');
        const missingInput = get('new-signal-missing');
        
        const brand = brandInput.value.trim().toUpperCase();
        const teeth = parseInt(teethInput.value);
        const missing = parseInt(missingInput.value);
        
        if (!brand) {
            alert("Introduce la marca o nombre (Ej: FORD, RENAULT)");
            return;
        }
        if (isNaN(teeth) || teeth <= 0) {
            alert("Introduce un número de dientes válido (> 0)");
            return;
        }
        if (isNaN(missing) || missing < 0) {
            alert("Introduce un número de dientes faltantes válido (>= 0)");
            return;
        }
        if (missing >= teeth) {
            alert("Los dientes faltantes no pueden ser mayores o iguales al total.");
            return;
        }
        
        const name = `${brand} ${teeth}-${missing}`;
        const desc = `${teeth}-${missing} DIENTES`;
        
        const sigArray = JSON.parse(localStorage.getItem('ckp_signals')) || DEFAULT_CKP_SIGNALS;
        
        if (sigArray.some(s => s.name === name)) {
            alert("Este patrón ya existe.");
            return;
        }
        
        const newSig = {
            id: 'sig_' + Date.now(),
            name: name,
            desc: desc,
            isDefault: false
        };
        
        sigArray.push(newSig);
        localStorage.setItem('ckp_signals', JSON.stringify(sigArray));
        
        brandInput.value = '';
        teethInput.value = '';
        missingInput.value = '';
        
        renderCkpSignals();
        
        // Volver automáticamente a la vista de listado para ver la nueva señal
        if (get('ckp-list-view')) get('ckp-list-view').style.display = 'block';
        if (get('ckp-add-view')) get('ckp-add-view').style.display = 'none';
        
        // Desplazar automáticamente hacia abajo en la lista
        const listContainer = get('ckp-signals-list');
        if (listContainer) {
            listContainer.scrollTop = listContainer.scrollHeight;
        }
    };
}

/* ========================================================
   LÓGICA DE BOTONES DE SEÑAL
   ======================================================== */
const signalBtns = document.querySelectorAll('.cyber-btn');
let currentSignal = 'ckp'; // Señal por defecto

signalBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        signalBtns.forEach(b => {
            b.classList.remove('active');
            b.classList.remove('running');
        });
        btn.classList.add('active');
        
        currentSignal = btn.getAttribute('data-signal');
        console.log("Señal seleccionada:", currentSignal);
        
        // Si el motor está encendido, el nuevo botón activo debe empezar a parpadear e iniciar animación inmediatamente
        const rpm = parseInt(rpmSlider.value);
        if (rpm > 0 && (isEngineActive || isCranking)) {
            btn.classList.add('running');
            const percentage = rpm / MAX_RPM;
            const blinkSpeed = Math.max(0.04, 0.6 - (percentage * 0.56));
            btn.style.setProperty('--blink-speed', `${blinkSpeed}s`);
            
            const spinSpeed = Math.max(0.15, 3.0 - (percentage * 2.85));
            const pulseSpeed = Math.max(0.15, 1.0 - (percentage * 0.85));
            const wiggleSpeed = Math.max(0.08, 0.5 - (percentage * 0.42));
            const floatSpeed = Math.max(0.3, 2.0 - (percentage * 1.7));
            
            btn.style.setProperty('--spin-speed', `${spinSpeed}s`);
            btn.style.setProperty('--pulse-speed', `${pulseSpeed}s`);
            btn.style.setProperty('--wiggle-speed', `${wiggleSpeed}s`);
            btn.style.setProperty('--float-speed', `${floatSpeed}s`);
        }
        
        if (currentSignal === 'ckp') {
            openCkpModal();
        } else {
            sendState();
            closeCkpModal();
        }
    });
});

// Inicialización de la señal CKP activa al cargar la página
initCkpSignals();
const initialCkpId = localStorage.getItem('active_ckp_id') || 'bosch';
const initialSigArray = JSON.parse(localStorage.getItem('ckp_signals')) || DEFAULT_CKP_SIGNALS;
const initialActiveSig = initialSigArray.find(s => s.id === initialCkpId) || initialSigArray[0];
const initialCkpBtn = document.querySelector('[data-signal="ckp"]');
if (initialCkpBtn && initialActiveSig) {
    const descEl = initialCkpBtn.querySelector('.btn-desc');
    if (descEl) descEl.innerText = initialActiveSig.name;
}

/* ========================================================
   LÓGICA DEL TEMA (MODO CLARO/OSCURO)
   ======================================================== */
const themeCheckbox = get('theme-toggle-checkbox');
const currentTheme = localStorage.getItem('theme') || 'dark';

if (currentTheme === 'light') {
    document.body.classList.add('light-mode');
    if (themeCheckbox) themeCheckbox.checked = false;
} else {
    document.body.classList.remove('light-mode');
    if (themeCheckbox) themeCheckbox.checked = true;
}

if (themeCheckbox) {
    themeCheckbox.addEventListener('change', () => {
        if (themeCheckbox.checked) {
            document.body.classList.remove('light-mode');
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.classList.add('light-mode');
            localStorage.setItem('theme', 'light');
        }
    });

    // Permitir hacer clic directo en los iconos de Sol/Luna para alternar el tema
    const sunIcon = document.querySelector('.theme-switch-wrapper .sun-icon');
    const moonIcon = document.querySelector('.theme-switch-wrapper .moon-icon');

    if (sunIcon) {
        sunIcon.addEventListener('click', () => {
            if (themeCheckbox.checked) {
                themeCheckbox.checked = false;
                themeCheckbox.dispatchEvent(new Event('change'));
            }
        });
    }

    if (moonIcon) {
        moonIcon.addEventListener('click', () => {
            if (!themeCheckbox.checked) {
                themeCheckbox.checked = true;
                themeCheckbox.dispatchEvent(new Event('change'));
            }
        });
    }
}

/* ========================================================
   LÓGICA DE CONTROL DEL MOTOR (START STOP ENGINE)
   ======================================================== */
const startBtn = get('engine-start-btn');
const startBezel = document.querySelector('.start-btn-bezel');

function setEngineRPM(targetRpm, duration, onComplete) {
    if (rpmInterval) clearInterval(rpmInterval);
    const startRpm = parseInt(rpmSlider.value);
    const startTime = performance.now();

    rpmInterval = setInterval(() => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing suave (out quad)
        const current = Math.round(startRpm + (targetRpm - startRpm) * progress);
        
        rpmSlider.value = current;
        
        // Si está en modo cranking (arranque), añadimos una pequeña oscilación a la aguja
        if (isCranking) {
            rpmVal.innerText = current;
            const percentage = current / MAX_RPM;
            const baseDegree = MIN_DEG + (percentage * (MAX_DEG - MIN_DEG));
            const vibrationOffset = Math.random() * 4 - 2; // +/- 2 grados de vibración
            tachoNeedle.style.transform = `rotate(${baseDegree + vibrationOffset}deg)`;
            
            // Efecto visual: Zona Roja (> 4000 RPM)
            const dashboard = get('dashboard-content');
            if (current > 4000) {
                dashboard.classList.add('danger-zone');
            } else {
                dashboard.classList.remove('danger-zone');
            }
        } else {
            updateTacho(current);
        }
        
        sendState();

        if (progress === 1) {
            clearInterval(rpmInterval);
            if (onComplete) onComplete();
        }
    }, 20); // 50 FPS para suavidad extrema
}

function startEngine() {
    if (isCranking || isEngineActive) return;
    isCranking = true;
    
    // Deshabilitar control del acelerador mientras arranca
    rpmSlider.disabled = true;
    
    // Activar vibración en el botón físico por CSS
    if (startBezel) startBezel.classList.add('engine-cranking');
    get('dashboard-content').classList.add('engine-on');
    
    // 1. Fase Cranking: RPM sube a 250 (velocidad del motor de arranque) en 450ms
    setEngineRPM(250, 450, () => {
        // Breve retraso simulando la compresión inicial
        setTimeout(() => {
            // El motor arranca con éxito!
            isCranking = false;
            isEngineActive = true;
            
            if (startBezel) {
                startBezel.classList.remove('engine-cranking');
                startBezel.classList.add('engine-active');
            }
            
            // Habilitar acelerador
            rpmSlider.disabled = false;
            
            // 2. Fase Ralentí: Sube suavemente a 900 RPM en 500ms
            setEngineRPM(900, 500);
        }, 120);
    });
}

function stopEngine() {
    if (isCranking) return; // Evitar apagar mientras arranca
    isEngineActive = false;
    
    if (startBezel) {
        startBezel.classList.remove('engine-active');
    }
    get('dashboard-content').classList.remove('engine-on');
    
    // Detener inmediatamente el parpadeo del botón de señal activo
    const activeBtn = document.querySelector('.cyber-btn.active');
    if (activeBtn) activeBtn.classList.remove('running');
    
    // Deshabilitar acelerador y permitir que el slider baje a 0 RPM
    rpmSlider.disabled = true;
    
    // El motor se apaga y cae suavemente a 0 RPM
    setEngineRPM(0, 600);
}

if (startBtn) {
    startBtn.addEventListener('click', () => {
        if (!isEngineActive) {
            startEngine();
        } else {
            stopEngine();
        }
    });
}