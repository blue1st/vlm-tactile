// VLM Benchmark Simulation Script

const arena = document.getElementById('arena');
const uiContainer = document.getElementById('gameUIContainer');
const targetNameDisplay = document.getElementById('targetName');
const targetCoordsDisplay = document.getElementById('targetCoords');
const hitCountDisplay = document.getElementById('hitCount');
const totalCountDisplay = document.getElementById('totalCount');
const shuffleBtn = document.getElementById('shuffleBtn');
const resetBtn = document.getElementById('resetBtn');
const debugLog = document.getElementById('debugLog');
const clickFeedback = document.getElementById('clickFeedback');

let hitCount = 0;
let totalCount = 0;
let currentTarget = null;

const BUTTON_TYPES = [
    { id: 'start', name: 'Start Button', class: 'game-btn-start', text: 'START' },
    { id: 'close', name: 'Close Icon', class: 'game-btn-close', text: '' },
    { id: 'settings', name: 'Settings Icon', class: 'game-btn-settings', text: '' },
    { id: 'options', name: 'Options Button', class: 'game-btn-start', text: 'OPTIONS' }, // Reuse style for now
];

function log(message, type = 'system') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString([], { hour12: false });
    entry.textContent = `[${time}] ${message}`;
    debugLog.appendChild(entry);
    debugLog.scrollTop = debugLog.scrollHeight;
}

function getRandomPos(width, height) {
    const arenaRect = arena.getBoundingClientRect();
    const margin = 50; 
    const maxX = arenaRect.width - width - margin;
    const maxY = arenaRect.height - height - margin;
    return {
        x: Math.max(margin, Math.floor(Math.random() * maxX)),
        y: Math.max(margin, Math.floor(Math.random() * maxY))
    };
}

function clearArena() {
    uiContainer.innerHTML = '';
}

function createButton(typeInfo) {
    const btn = document.createElement('div');
    btn.className = `game-btn ${typeInfo.class}`;
    btn.textContent = typeInfo.text;
    btn.dataset.name = typeInfo.name;
    btn.dataset.id = typeInfo.id;
    
    // Append to measure size
    uiContainer.appendChild(btn);
    const rect = btn.getBoundingClientRect();
    
    const pos = getRandomPos(rect.width, rect.height);
    btn.style.left = `${pos.x}px`;
    btn.style.top = `${pos.y}px`;
    
    return btn;
}

function shuffle() {
    clearArena();
    totalCount++;
    totalCountDisplay.textContent = totalCount;
    
    // Create 3-5 random buttons
    const numButtons = 3 + Math.floor(Math.random() * 3);
    const placedIndices = [];
    const buttons = [];
    
    for (let i = 0; i < numButtons; i++) {
        let typeIdx;
        do {
            typeIdx = Math.floor(Math.random() * BUTTON_TYPES.length);
        } while (placedIndices.includes(typeIdx) && placedIndices.length < BUTTON_TYPES.length);
        
        placedIndices.push(typeIdx);
        const btn = createButton(BUTTON_TYPES[typeIdx]);
        buttons.push(btn);
    }
    
    // Pick one as target
    const targetIdx = Math.floor(Math.random() * buttons.length);
    currentTarget = buttons[targetIdx];
    
    updateTargetInfo();
    log(`New Layout: Target is ${currentTarget.dataset.name}`, 'system');
}

function updateTargetInfo() {
    if (!currentTarget) return;
    
    const rect = currentTarget.getBoundingClientRect();
    const arenaRect = arena.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // Arena-relative (0-1000)
    const arenaX = Math.round((rect.left + rect.width / 2 - arenaRect.left) / arenaRect.width * 1000);
    const arenaY = Math.round((rect.top + rect.height / 2 - arenaRect.top) / arenaRect.height * 1000);
    
    // Window-relative (0-1000) - often what VLM sees if capturing the whole window
    const winX = Math.round((rect.left + rect.width / 2) / windowWidth * 1000);
    const winY = Math.round((rect.top + rect.height / 2) / windowHeight * 1000);
    
    targetNameDisplay.textContent = currentTarget.dataset.name;
    targetCoordsDisplay.innerHTML = `
        <div style="color: var(--accent)">Arena: ${arenaX}, ${arenaY}</div>
        <div style="font-size: 11px; opacity: 0.7">Window: ${winX}, ${winY}</div>
    `;
}

function handleArenaClick(e) {
    const rect = arena.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    showClickFeedback(x, y);
    
    // Create a persistent small dot for the last click to debug alignment
    let lastMarker = document.getElementById('lastClickMarker');
    if (!lastMarker) {
        lastMarker = document.createElement('div');
        lastMarker.id = 'lastClickMarker';
        lastMarker.style.position = 'absolute';
        lastMarker.style.width = '6px';
        lastMarker.style.height = '6px';
        lastMarker.style.background = '#ff4757';
        lastMarker.style.borderRadius = '50%';
        lastMarker.style.pointerEvents = 'none';
        lastMarker.style.zIndex = '60';
        lastMarker.style.boxShadow = '0 0 5px #ff4757';
        arena.appendChild(lastMarker);
    }
    lastMarker.style.left = `${x - 3}px`;
    lastMarker.style.top = `${y - 3}px`;
    lastMarker.style.display = 'block';

    // Check if we hit the target
    const targetRect = currentTarget.getBoundingClientRect();
    const margin = 2; // Adding 2px margin for robustness
    
    // Check 1: Did we click the element directly?
    const clickedElement = e.target.closest('.game-btn');
    const isTargetElement = clickedElement === currentTarget;
    
    // Check 2: Are the coordinates within the target rect (with margin)?
    const isWithinBounds = (
        e.clientX >= targetRect.left - margin && 
        e.clientX <= targetRect.right + margin && 
        e.clientY >= targetRect.top - margin && 
        e.clientY <= targetRect.bottom + margin
    );
    
    const isHit = isTargetElement || isWithinBounds;
    
    console.log(`[Bench] Click at W(${Math.round(e.clientX)}, ${Math.round(e.clientY)}), Target: [${Math.round(targetRect.left)}-${Math.round(targetRect.right)}, ${Math.round(targetRect.top)}-${Math.round(targetRect.bottom)}]. Hit? ${isHit}`);

    if (isHit) {
        hitCount++;
        hitCountDisplay.textContent = hitCount;
        log(`HIT! Clicked at Window(${Math.round(e.clientX)}, ${Math.round(e.clientY)})`, 'hit');
        
        // Hide marker and pause briefly
        setTimeout(() => {
            lastMarker.style.display = 'none';
            shuffle();
        }, 800);
    } else {
        const targetX_center = Math.round(targetRect.left + targetRect.width / 2);
        const targetY_center = Math.round(targetRect.top + targetRect.height / 2);
        log(`MISS at W(${Math.round(e.clientX)}, ${Math.round(e.clientY)}). Expected near (${targetX_center}, ${targetY_center})`, 'miss');
        console.warn(`[Bench] Miss Detail: Button at Viewport X:${Math.round(targetRect.left)}-${Math.round(targetRect.right)}, Y:${Math.round(targetRect.top)}-${Math.round(targetRect.bottom)}`);
    }
}

function showClickFeedback(x, y) {
    clickFeedback.style.left = `${x}px`;
    clickFeedback.style.top = `${y}px`;
    clickFeedback.classList.remove('animate-wave');
    void clickFeedback.offsetWidth; // trigger reflow
    clickFeedback.classList.add('animate-wave');
}

function reset() {
    hitCount = 0;
    totalCount = 0;
    hitCountDisplay.textContent = 0;
    totalCountDisplay.textContent = 0;
    log("Scores reset.", 'system');
    shuffle();
}

const toggleHitboxBtn = document.getElementById('toggleHitbox');

toggleHitboxBtn.addEventListener('click', () => {
    arena.classList.toggle('show-hitbox');
});

shuffleBtn.addEventListener('click', shuffle);
resetBtn.addEventListener('click', reset);
arena.addEventListener('click', handleArenaClick);

// Initial shuffle
window.addEventListener('resize', updateTargetInfo);
shuffle();
log("VLM Benchmark ready.");
