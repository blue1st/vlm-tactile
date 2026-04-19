const { app, BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron');
const path = require('path');
const { mouse, Button, Point, keyboard, Key, ScrollDirection } = require('@nut-tree-fork/nut-js');
const { Ollama } = require('ollama');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 550,
        height: 950,
        transparent: false,
        frame: true,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    // Make it even more persistent on Mac
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setAlwaysOnTop(true, 'screen-saver');

    mainWindow.loadFile('index.html');
}

let benchmarkWindow = null;

ipcMain.handle('open-benchmark', () => {
    if (benchmarkWindow) {
        benchmarkWindow.focus();
        return;
    }

    benchmarkWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        backgroundColor: '#0a0a0f',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    benchmarkWindow.loadFile('benchmark.html');

    benchmarkWindow.on('closed', () => {
        benchmarkWindow = null;
    });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-models', async (event, serverAddress) => {
    try {
        const ollama = new Ollama({ host: serverAddress });
        const response = await ollama.list();
        return { success: true, models: response.models.map(m => m.name) };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Capture full screen for area selection in UI
ipcMain.handle('get-full-screenshot', async () => {
    try {
        const primary = screen.getPrimaryDisplay();
        const { width, height } = primary.size;
        
        mainWindow.setOpacity(0);
        await new Promise(r => setTimeout(r, 200));
        const sources = await desktopCapturer.getSources({ 
            types: ['screen'], 
            thumbnailSize: { width: 1920, height: 1080 } 
        });
        mainWindow.setOpacity(1);
        if (sources.length === 0) throw new Error("No screen found");
        return { success: true, base64: sources[0].thumbnail.toPNG().toString('base64'), width, height };
    } catch (e) {
        mainWindow.setOpacity(1);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('process-screen', async (event, prompt, modelName, serverAddress, region) => {
    try {
        const ollama = new Ollama({ host: serverAddress });
        const primary = screen.getPrimaryDisplay();
        const { width, height } = primary.size; // Logical size (points)
        const scaleFactor = primary.scaleFactor || 1;

        // 1. Check if window overlaps with the capture region
        const winBounds = mainWindow.getBounds();
        let needsHidden = true; // Default to true for full screen or overlap

        if (region && region.w > 0 && region.h > 0) {
            // Check for overlap between window [x, y, w, h] and region [x, y, w, h]
            const rex = parseInt(region.x);
            const rey = parseInt(region.y);
            const rew = parseInt(region.w);
            const reh = parseInt(region.h);

            const noOverlap = (
                winBounds.x > rex + rew ||
                winBounds.x + winBounds.width < rex ||
                winBounds.y > rey + reh ||
                winBounds.y + winBounds.height < rey
            );
            
            if (noOverlap) needsHidden = false;
        }

        if (needsHidden) {
            mainWindow.setOpacity(0);
            await new Promise(r => setTimeout(r, 200));
        }

        const sources = await desktopCapturer.getSources({ 
            types: ['screen'], 
            thumbnailSize: { width: Math.round(width * scaleFactor), height: Math.round(height * scaleFactor) } 
        });

        if (needsHidden) {
            mainWindow.setOpacity(1);
        }

        if (sources.length === 0) throw new Error("No screen source found");
        
        const fullThumbnail = sources[0].thumbnail;
        let screenshot = fullThumbnail;

        // Crop region if specified
        // region.x, y, w, h are in LOGICAL points from UI
        // We must convert them to pixels for cropping the thumbnail
        if (region && region.w > 0 && region.h > 0) {
            screenshot = screenshot.crop({
                x: Math.round(parseInt(region.x) * scaleFactor),
                y: Math.round(parseInt(region.y) * scaleFactor),
                width: Math.round(parseInt(region.w) * scaleFactor),
                height: Math.round(parseInt(region.h) * scaleFactor)
            });
        }
        
        const base64Screenshot = screenshot.toPNG().toString('base64');
        const fullSmall = fullThumbnail.resize({ width: 800 }).toPNG().toString('base64');

        // 2. Send to Ollama
        const systemPrompt = `You are a game-playing AI. Analyze the image and decide the next action.
OUTPUT MUST BE STRICT JSON. Supported actions:
- { "action": "click", "x": 0.0-1.0, "y": 0.0-1.0, "reason": "string" } (Left click)
- { "action": "right_click", "x": 0.0-1.0, "y": 0.0-1.0, "reason": "string" }
- { "action": "middle_click", "x": 0.0-1.0, "y": 0.0-1.0, "reason": "string" }
- { "action": "double_click", "x": 0.0-1.0, "y": 0.0-1.0, "reason": "string" }
- { "action": "drag_and_drop", "from_x": 0.0-1.0, "from_y": 0.0-1.0, "to_x": 0.0-1.0, "to_y": 0.0-1.0, "reason": "string" }
- { "action": "scroll", "direction": "up"|"down", "amount": number, "reason": "string" }
- { "action": "keypress", "key": "string", "reason": "string" }
- { "action": "wait", "reason": "string" }

NOTES:
- Coordinates "x", "y", "from_x", etc. are normalized (0.0 to 1.0) relative to the image.
- "key" examples: "w", "a", "s", "d", "space", "enter", "escape", "shift", "tab".
- If unsure, use "wait".`;

        const response = await ollama.chat({
            model: modelName, 
            messages: [{
                role: 'user',
                content: prompt || 'Analyze this screen and perform the next click if needed.',
                images: [base64Screenshot]
            }, {
                role: 'system',
                content: systemPrompt
            }]
        });

        const content = response.message.content;
        console.log("AI says:", content);
        const actionMatch = content.match(/\{.*\}/s);
        
        if (actionMatch) {
            try {
                const action = JSON.parse(actionMatch[0]);
                const regX = parseInt(region.x);
                const regY = parseInt(region.y);
                const regW = parseInt(region.w) || width;
                const regH = parseInt(region.h) || height;

                const toGlobal = (nx, ny) => ({
                    x: Math.round(regX + (nx * regW)),
                    y: Math.round(regY + (ny * regH))
                });

                if (['click', 'right_click', 'middle_click', 'double_click'].includes(action.action)) {
                    const pos = toGlobal(action.x, action.y);
                    await mouse.setPosition(new Point(pos.x, pos.y));
                    await new Promise(r => setTimeout(r, 100));
                    
                    if (action.action === 'click') await mouse.click(Button.LEFT);
                    else if (action.action === 'right_click') await mouse.click(Button.RIGHT);
                    else if (action.action === 'middle_click') await mouse.click(Button.MIDDLE);
                    else if (action.action === 'double_click') await mouse.doubleClick(Button.LEFT);
                    
                    return { success: true, action, content, screenshot: base64Screenshot, full: fullSmall };
                } 
                else if (action.action === 'drag_and_drop') {
                    const from = toGlobal(action.from_x, action.from_y);
                    const to = toGlobal(action.to_x, action.to_y);
                    
                    await mouse.setPosition(new Point(from.x, from.y));
                    await new Promise(r => setTimeout(r, 100));
                    await mouse.drag(new Point(to.x, to.y));
                    
                    return { success: true, action, content, screenshot: base64Screenshot, full: fullSmall };
                }
                else if (action.action === 'scroll') {
                    const amount = parseInt(action.amount) || 1;
                    if (action.direction === 'up') await mouse.scrollUp(amount);
                    else if (action.direction === 'down') await mouse.scrollDown(amount);
                    
                    return { success: true, action, content, screenshot: base64Screenshot, full: fullSmall };
                }
                else if (action.action === 'keypress') {
                    if (!action.key) return { success: false, error: "Key not specified", content };
                    let key = action.key.toLowerCase();
                    const keyMap = {
                        'space': Key.Space, 'enter': Key.Enter, 'tab': Key.Tab, 'escape': Key.Escape,
                        'up': Key.Up, 'down': Key.Down, 'left': Key.Left, 'right': Key.Right,
                        'shift': Key.LeftShift, 'ctrl': Key.LeftControl, 'alt': Key.LeftAlt
                    };

                    if (keyMap[key]) {
                        await keyboard.type(keyMap[key]);
                    } else if (key.length === 1) {
                        const keyName = key.toUpperCase();
                        if (Key[keyName]) await keyboard.type(Key[keyName]);
                        else console.warn(`Key ${keyName} not found.`);
                    }
                    return { success: true, action, content, screenshot: base64Screenshot, full: fullSmall };
                }
                else {
                    console.log("[VLM-Tactile] No valid action or 'wait' parsed.");
                    return { success: false, action, content, screenshot: base64Screenshot, full: fullSmall };
                }
            } catch (e) {
                console.error("[VLM-Tactile] JSON Parse error:", e, "Content:", content);
                return { success: false, error: "AI returned invalid JSON", content, screenshot: base64Screenshot, full: fullSmall };
            }
        }

        return { success: false, content, screenshot: base64Screenshot, full: fullSmall };
    } catch (error) {
        mainWindow.setOpacity(1);
        console.error("Processing error:", error);
        return { success: false, error: error.message };
    }
});
