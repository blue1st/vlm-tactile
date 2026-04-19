const { ipcRenderer } = require('electron');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const spinner = document.getElementById('spinner');
const promptInput = document.getElementById('promptInput');
const additionalPrompt = document.getElementById('additionalPrompt');
const serverAddressInput = document.getElementById('serverAddress');
const modelSelect = document.getElementById('modelSelect');
const refreshModelsBtn = document.getElementById('refreshModels');
const intervalInput = document.getElementById('intervalInput');

const previewContainer = document.getElementById('previewContainer');
const screenshotPreview = document.getElementById('screenshotPreview');
const selectionBox = document.getElementById('selectionBox');
const clickIndicator = document.getElementById('clickIndicator');
const regionValue = document.getElementById('regionValue');
const snapBtn = document.getElementById('snapBtn');

const countdownContainer = document.getElementById('countdownContainer');
const countdownBar = document.getElementById('countdownBar');

const regXInput = document.getElementById('regX');
const regYInput = document.getElementById('regY');
const regWInput = document.getElementById('regW');
const regHInput = document.getElementById('regH');

let isLooping = false;
let startX, startY;
let isSelecting = false;
let screenWidth = 1920;
let screenHeight = 1080;

function updatePreview(base64) {
    if (isSelecting) return;
    screenshotPreview.src = `data:image/png;base64,${base64}`;
}

async function initialSnap() {
    const result = await ipcRenderer.invoke('get-full-screenshot');
    if (result.success) {
        screenWidth = result.width;
        screenHeight = result.height;
        updatePreview(result.base64);
        regionValue.textContent = `Full Screen: ${screenWidth}x${screenHeight}`;
    }
}

let interactionMode = null; // 'drawing', 'moving', 'resizing'
let resizeHandle = null;
let dragStartX, dragStartY;
let initialRect = { x: 0, y: 0, w: 0, h: 0 };

function updateRegionInputs() {
    const rect = previewContainer.getBoundingClientRect();
    const boxRect = selectionBox.getBoundingClientRect();

    // Calculate actual image geometry inside container
    const containerRatio = rect.width / rect.height;
    const screenRatio = screenWidth / screenHeight;

    let displayW, displayH, offsetX, offsetY;
    if (screenRatio > containerRatio) {
        displayW = rect.width;
        displayH = rect.width / screenRatio;
        offsetX = 0;
        offsetY = (rect.height - displayH) / 2;
    } else {
        displayH = rect.height;
        displayW = rect.height * screenRatio;
        offsetY = 0;
        offsetX = (rect.width - displayW) / 2;
    }

    // Coordinates relative to the actual IMAGE pixels
    const widthFactor = screenWidth / displayW; 
    const heightFactor = screenHeight / displayH;

    const x = Math.round((boxRect.left - rect.left - offsetX) * widthFactor);
    const y = Math.round((boxRect.top - rect.top - offsetY) * heightFactor);
    const w = Math.round(boxRect.width * widthFactor);
    const h = Math.round(boxRect.height * heightFactor);

    regXInput.value = Math.max(0, x);
    regYInput.value = Math.max(0, y);
    regWInput.value = Math.min(screenWidth - x, w);
    regHInput.value = Math.min(screenHeight - y, h);

    regionValue.textContent = `Region: ${w}x${h} at (${x}, ${y})`;
}

previewContainer.addEventListener('mousedown', (e) => {
    const rect = previewContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicked on selectionBox or handles
    const target = e.target;
    if (target.classList.contains('handle')) {
        interactionMode = 'resizing';
        resizeHandle = target.classList[1];
    } else if (target === selectionBox) {
        interactionMode = 'moving';
    } else {
        interactionMode = 'drawing';
        selectionBox.style.display = 'block';
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
        selectionBox.style.left = `${x}px`;
        selectionBox.style.top = `${y}px`;
    }

    dragStartX = x;
    dragStartY = y;
    initialRect = {
        x: parseFloat(selectionBox.style.left) || 0,
        y: parseFloat(selectionBox.style.top) || 0,
        w: parseFloat(selectionBox.style.width) || 0,
        h: parseFloat(selectionBox.style.height) || 0
    };
});

window.addEventListener('mousemove', (e) => {
    if (!interactionMode) return;
    const rect = previewContainer.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    const dx = x - dragStartX;
    const dy = y - dragStartY;

    if (interactionMode === 'drawing') {
        const left = Math.min(dragStartX, x);
        const top = Math.min(dragStartY, y);
        const width = Math.abs(dragStartX - x);
        const height = Math.abs(dragStartY - y);
        selectionBox.style.left = `${left}px`;
        selectionBox.style.top = `${top}px`;
        selectionBox.style.width = `${width}px`;
        selectionBox.style.height = `${height}px`;
    } else if (interactionMode === 'moving') {
        let newX = initialRect.x + dx;
        let newY = initialRect.y + dy;
        // Boundary checks
        newX = Math.max(0, Math.min(newX, rect.width - initialRect.w));
        newY = Math.max(0, Math.min(newY, rect.height - initialRect.h));
        selectionBox.style.left = `${newX}px`;
        selectionBox.style.top = `${newY}px`;
    } else if (interactionMode === 'resizing') {
        let { x: rx, y: ry, w: rw, h: rh } = initialRect;
        
        if (resizeHandle.includes('e')) rw = Math.max(10, initialRect.w + dx);
        if (resizeHandle.includes('s')) rh = Math.max(10, initialRect.h + dy);
        if (resizeHandle.includes('w')) {
            const potentialW = initialRect.w - dx;
            if (potentialW > 10) {
                rx = initialRect.x + dx;
                rw = potentialW;
            }
        }
        if (resizeHandle.includes('n')) {
            const potentialH = initialRect.h - dy;
            if (potentialH > 10) {
                ry = initialRect.y + dy;
                rh = potentialH;
            }
        }
        selectionBox.style.left = `${rx}px`;
        selectionBox.style.top = `${ry}px`;
        selectionBox.style.width = `${rw}px`;
        selectionBox.style.height = `${rh}px`;
    }
    updateRegionInputs();
});

window.addEventListener('mouseup', () => {
    interactionMode = null;
    resizeHandle = null;
});

async function refreshModels() {
    const address = serverAddressInput.value;
    try {
        const result = await ipcRenderer.invoke('get-models', address);
        if (result.success) {
            modelSelect.innerHTML = '';
            result.models.forEach(model => {
                const opt = document.createElement('option');
                opt.value = model;
                opt.textContent = model;
                modelSelect.appendChild(opt);
            });
        }
    } catch (e) {}
}

async function startCountdown(seconds) {
    if (!isLooping) return;
    countdownContainer.style.display = 'block';
    countdownBar.style.transition = 'none';
    countdownBar.style.width = '100%';
    
    // Force reflow
    countdownBar.offsetHeight;
    
    countdownBar.style.transition = `width ${seconds}s linear`;
    countdownBar.style.width = '0%';
    
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function processNextFrame() {
    if (!isLooping) return;

    // Concat Base + Permissions + User prompt
    const allowedKeys = document.getElementById('allowedKeys').value;
    const allowRight = document.getElementById('allowRightClick').checked;
    const allowDrag = document.getElementById('allowDrag').checked;
    const allowScroll = document.getElementById('allowScroll').checked;

    let permissionPrompt = `\n\n### ACTION PERMISSIONS:\n- Allowed keys: [${allowedKeys}]`;
    if (allowRight) permissionPrompt += `\n- Right/Middle/Double click: ENABLED`;
    if (allowDrag) permissionPrompt += `\n- Drag and Drop: ENABLED`;
    if (allowScroll) permissionPrompt += `\n- Scroll: ENABLED`;

    const fullPrompt = `${promptInput.value}${permissionPrompt}\n\nAdditional Instruction: ${additionalPrompt.value}`;
    const model = modelSelect.value;
    const serverAddress = serverAddressInput.value;

    const region = {
        x: regXInput.value,
        y: regYInput.value,
        w: regWInput.value,
        h: regHInput.value
    };

    if (!model) {
        updateStatus("⚠️ Select a model.");
        isLooping = false;
        return;
    }

    updateStatus(`📸 Capturing...`);
    
    // Show 'Thinking' status in progress bar & overlay
    const thinkingOverlay = document.getElementById('thinkingOverlay');
    const startBtnText = document.getElementById('btnText');
    
    thinkingOverlay.style.display = 'flex';
    if (startBtnText) startBtnText.textContent = "AI is thinking...";
    
    countdownContainer.style.display = 'block';
    countdownBar.style.transition = 'none';
    countdownBar.style.width = '100.1%'; 
    countdownBar.classList.add('thinking'); 

    const result = await ipcRenderer.invoke('process-screen', fullPrompt, model, serverAddress, region);

    countdownBar.classList.remove('thinking');
    thinkingOverlay.style.display = 'none';
    if (startBtnText) startBtnText.textContent = "Start Automation";

    if (result.full) {
        updatePreview(result.full);
    }

    if (result.success && result.action) {
        let actionDesc = result.action.action;
        if (result.action.action === 'click') actionDesc = 'Click';
        else if (result.action.action === 'right_click') actionDesc = 'Right Click';
        else if (result.action.action === 'keypress') actionDesc = `Press [${result.action.key}]`;
        else if (result.action.action === 'drag_and_drop') actionDesc = 'Drag & Drop';
        else if (result.action.action === 'scroll') actionDesc = `Scroll ${result.action.direction}`;

        updateStatus(`🤖 ${actionDesc}: ${result.action.reason}`);
        
        // Show indicator on preview with object-fit: contain awareness
        const pos = result.action.action.includes('click') ? result.action : 
                    (result.action.action === 'drag_and_drop' ? { x: result.action.from_x, y: result.action.from_y } : null);

        if (pos && pos.x !== undefined && pos.y !== undefined) {
            const rect = previewContainer.getBoundingClientRect();
            const globalX = parseInt(region.x) + (pos.x * (parseInt(region.w) || screenWidth));
            const globalY = parseInt(region.y) + (pos.y * (parseInt(region.h) || screenHeight));
            
            // Calculate actual image size and offset inside the container (object-fit: contain)
            const containerRatio = rect.width / rect.height;
            const screenRatio = screenWidth / screenHeight;
            
            let displayW, displayH, offsetX, offsetY;
            if (screenRatio > containerRatio) {
                // Image is limited by width, centered vertically
                displayW = rect.width;
                displayH = rect.width / screenRatio;
                offsetX = 0;
                offsetY = (rect.height - displayH) / 2;
            } else {
                // Image is limited by height, centered horizontally
                displayH = rect.height;
                displayW = rect.height * screenRatio;
                offsetY = 0;
                offsetX = (rect.width - displayW) / 2;
            }

            const px = offsetX + (globalX / screenWidth) * displayW;
            const py = offsetY + (globalY / screenHeight) * displayH;

            clickIndicator.style.left = `${px}px`;
            clickIndicator.style.top = `${py}px`;
            clickIndicator.style.display = 'block';
            
            clickIndicator.style.animation = 'none';
            clickIndicator.offsetHeight; 
            clickIndicator.style.animation = '';
        }
    } else {
        const reason = result.action ? result.action.reason : (result.error || "Waiting...");
        updateStatus(`😴 ${reason}`);
    }

    // Interval Wait
    const interval = parseFloat(intervalInput.value) || 3;
    await startCountdown(interval);
    
    // Auto recursion
    if (isLooping) processNextFrame();
}

async function startCountdown(seconds) {
    if (!isLooping) return;
    
    countdownContainer.style.display = 'block';
    countdownBar.style.transition = 'none';
    countdownBar.style.width = '100.1%';
    
    // Force a browser reflow to clear previous transitions/states
    void countdownBar.offsetWidth;
    
    countdownBar.style.transition = `width ${seconds}s linear`;
    countdownBar.style.width = '0%';
    
    return new Promise(resolve => {
        const timer = setTimeout(() => {
            if (!isLooping) countdownContainer.style.display = 'none';
            resolve();
        }, seconds * 1000);
    });
}

function updateStatus(msg) {
    const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    statusDiv.innerHTML += `<div><span style="color:rgba(255,255,255,0.3)">[${time}]</span> ${msg}</div>`;
    statusDiv.scrollTop = statusDiv.scrollHeight;
}

startBtn.addEventListener('click', () => {
    isLooping = true;
    startBtn.style.display = 'none';
    stopBtn.style.display = 'flex';
    spinner.style.display = 'block';
    processNextFrame();
});

stopBtn.addEventListener('click', () => {
    isLooping = false;
    startBtn.style.display = 'flex';
    stopBtn.style.display = 'none';
    spinner.style.display = 'none';
    countdownContainer.style.display = 'none';
});

const benchmarkBtn = document.getElementById('benchmarkBtn');

benchmarkBtn.addEventListener('click', () => {
    ipcRenderer.invoke('open-benchmark');
});

refreshModelsBtn.addEventListener('click', refreshModels);
snapBtn.addEventListener('click', initialSnap);

refreshModels();
initialSnap();
