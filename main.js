const { app, BrowserWindow, globalShortcut, desktopCapturer, screen, ipcMain, clipboard, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Enforce single instance lock to prevent cache lock conflicts
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Main] Another instance of Halo is already running. Quitting duplicate.');
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  console.log('[Main] Second instance triggered. Activating Halo overlay...');
  triggerHaloSearch();
});

let mainWindow = null;
let tray = null;
let pythonProcess = null;
let stdoutBuffer = '';
const pendingRequests = new Map();
let requestIdCounter = 1;

// Determine python executable path
function getPythonCommand() {
  return process.platform === 'win32' ? 'python' : 'python3';
}

// Start Python sidecar worker process
function startPythonWorker() {
  const workerScript = path.join(__dirname, 'python_backend', 'worker.py');
  const pyCmd = getPythonCommand();

  console.log(`[Main] Spawning Python sidecar: ${pyCmd} ${workerScript}`);
  pythonProcess = spawn(pyCmd, [workerScript], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  pythonProcess.stdout.on('data', (data) => {
    stdoutBuffer += data.toString('utf-8');
    const lines = stdoutBuffer.split('\n');
    // Keep the last incomplete fragment in buffer
    stdoutBuffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const response = JSON.parse(trimmed);
        const reqId = response.id;
        if (pendingRequests.has(reqId)) {
          const { resolve, reject } = pendingRequests.get(reqId);
          pendingRequests.delete(reqId);
          if (response.status === 'success') {
            resolve(response.data);
          } else {
            reject(new Error(response.message || 'Worker error'));
          }
        }
      } catch (err) {
        console.error('[Main] Failed to parse Python stdout JSON:', trimmed, err);
      }
    }
  });

  pythonProcess.stderr.on('data', (data) => {
    console.log(`[Python Worker Log] ${data.toString('utf-8').trim()}`);
  });

  pythonProcess.on('exit', (code, signal) => {
    console.warn(`[Main] Python worker exited with code ${code}, signal ${signal}. Restarting in 2s...`);
    setTimeout(startPythonWorker, 2000);
  });

  pythonProcess.on('error', (err) => {
    console.error('[Main] Failed to spawn Python sidecar:', err);
  });
}

// Send JSON request to Python sidecar over stdio
function sendPythonRequest(action, payload) {
  return new Promise((resolve, reject) => {
    if (!pythonProcess || !pythonProcess.stdin.writable) {
      return reject(new Error('Python worker process not available'));
    }
    const id = `req-${Date.now()}-${requestIdCounter++}`;
    pendingRequests.set(id, { resolve, reject });

    const message = JSON.stringify({ id, action, payload }) + '\n';
    pythonProcess.stdin.write(message, 'utf-8', (err) => {
      if (err) {
        pendingRequests.delete(id);
        reject(err);
      }
    });

    // 60-second timeout safeguard
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Request to Python worker timed out (60s)'));
      }
    }, 60000);
  });
}

let screenshotDesktop = null;
try {
  screenshotDesktop = require('screenshot-desktop');
} catch (e) {
  console.warn('[Main] screenshot-desktop not available, will use desktopCapturer');
}

// Capture primary screen using screenshot-desktop (or fallback to desktopCapturer)
async function capturePrimaryScreen() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  const scale = primaryDisplay.scaleFactor || 1;

  // 1. Try native screenshot-desktop (reliable on Windows)
  if (screenshotDesktop) {
    try {
      const imgBuffer = await screenshotDesktop({ format: 'png' });
      if (imgBuffer && imgBuffer.length > 100) {
        return {
          dataUrl: `data:image/png;base64,${imgBuffer.toString('base64')}`,
          width,
          height,
          scaleFactor: scale
        };
      }
    } catch (scErr) {
      console.warn('[Main] screenshot-desktop failed, falling back to desktopCapturer:', scErr);
    }
  }

  // 2. Fallback to desktopCapturer
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(width * scale),
      height: Math.round(height * scale)
    }
  });

  const primarySource = sources.find(s => s.display_id === primaryDisplay.id.toString()) || sources[0];
  if (!primarySource || !primarySource.thumbnail || primarySource.thumbnail.isEmpty()) {
    // Generate a fallback neutral 1x1 transparent/black png if screenshot fails
    console.warn('[Main] Thumbnail empty, generating backdrop placeholder');
    const fallbackPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    return { dataUrl: fallbackPng, width, height, scaleFactor: scale };
  }

  return {
    dataUrl: primarySource.thumbnail.toDataURL(),
    width,
    height,
    scaleFactor: scale
  };
}

// Create the frameless transparent overlay window
function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.bounds;

  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    show: false,
    enableLargerThanScreen: true,
    icon: path.join(__dirname, 'assets', 'app_icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Trigger the Halo Circle-to-Search workflow
async function triggerHaloSearch() {
  try {
    console.log('[Main] Capturing screen for Halo Circle-to-Search...');

    // Temporarily hide overlay if open to capture clean desktop
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide();
      await new Promise(r => setTimeout(r, 80));
    }

    const captureData = await capturePrimaryScreen();

    if (!mainWindow) {
      createOverlayWindow();
    }

    if (mainWindow.webContents.isLoading()) {
      await new Promise(resolve => {
        mainWindow.webContents.once('did-finish-load', resolve);
      });
    }

    // Pass screenshot data to renderer
    mainWindow.webContents.send('screen-captured', captureData);

    // Show and bring overlay to focus
    mainWindow.show();
    mainWindow.focus();
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.moveTop();
  } catch (err) {
    console.error('[Main] Error triggering Halo search:', err);
  }
}

// Register global shortcuts
function registerShortcuts() {
  const shortcuts = [
    { key: 'CommandOrControl+Alt+Z', label: 'Ctrl + Alt + Z (Primary)' },
    { key: 'CommandOrControl+Shift+S', label: 'Ctrl + Shift + S (Alternate 1)' },
    { key: 'CommandOrControl+Alt+H', label: 'Ctrl + Alt + H (Alternate 2)' }
  ];

  for (const { key, label } of shortcuts) {
    try {
      const ok = globalShortcut.register(key, () => {
        console.log(`[Main] Global shortcut triggered: ${key}`);
        triggerHaloSearch();
      });
      if (ok) {
        console.log(`[Main] Successfully registered shortcut: ${label}`);
      } else {
        console.warn(`[Main] Warning: Could not register ${label} (in use by another application)`);
      }
    } catch (e) {
      console.warn(`[Main] Error registering ${label}:`, e);
    }
  }
}

// Create system tray icon
function createTray() {
  const fs = require('fs');
  const icoPath = path.join(__dirname, 'assets', 'tray_icon.ico');
  const pngPath = path.join(__dirname, 'assets', 'tray_icon.png');

  const trayIconPath = fs.existsSync(icoPath) ? icoPath : pngPath;
  console.log(`[Main] Loading system tray icon from: ${trayIconPath}`);

  try {
    tray = new Tray(trayIconPath);
    tray.setToolTip('Halo - Circle to Search (Ctrl+Alt+Z / Ctrl+Shift+S)');

    const contextMenu = Menu.buildFromTemplate([
      { label: '✦ Halo: Circle to Search', enabled: false },
      { type: 'separator' },
      { label: 'Activate Halo (Ctrl + Alt + Z)', click: triggerHaloSearch },
      { label: 'Alternate (Ctrl + Shift + S)', click: triggerHaloSearch },
      { label: 'Alternate (Ctrl + Alt + H)', click: triggerHaloSearch },
      {
        label: 'Toggle Developer Tools',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.toggleDevTools();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit Halo',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      console.log('[Main] Tray icon clicked! Activating Halo search overlay...');
      triggerHaloSearch();
    });
    tray.on('double-click', () => {
      triggerHaloSearch();
    });
    console.log('[Main] System tray icon registered successfully.');
  } catch (trayErr) {
    console.error('[Main] Failed to create system tray icon:', trayErr);
  }
}

// Setup IPC handlers
function setupIPC() {
  // User circled an area and wants to analyze it
  ipcMain.on('crop-and-search', async (event, payload) => {
    try {
      console.log('[Main] Received crop-and-search request. Forwarding to Python...');
      const imgBase64 = (payload && (payload.image_base64 || payload.imageBase64)) || '';
      const result = await sendPythonRequest('analyze', {
        ...payload,
        image_base64: imgBase64,
        imageBase64: imgBase64
      });
      event.sender.send('analysis-result', result);
    } catch (err) {
      console.error('[Main] Python analysis failed:', err);
      event.sender.send('analysis-error', { message: err.message });
    }
  });

  // User asked follow-up query
  ipcMain.on('ask-follow-up', async (event, payload) => {
    try {
      console.log('[Main] Received ask-follow-up request. Forwarding to Python...');
      const result = await sendPythonRequest('follow_up', payload);
      event.sender.send('analysis-result', result);
    } catch (err) {
      console.error('[Main] Follow-up failed:', err);
      event.sender.send('analysis-error', { message: err.message });
    }
  });

  // User asked for translation
  ipcMain.on('translate-text', async (event, payload) => {
    try {
      const result = await sendPythonRequest('translate', payload);
      event.sender.send('analysis-result', result);
    } catch (err) {
      event.sender.send('analysis-error', { message: err.message });
    }
  });

  // Clipboard copy
  ipcMain.on('copy-to-clipboard', (event, text) => {
    if (text) {
      clipboard.writeText(text);
      console.log('[Main] Text copied to clipboard');
    }
  });

  // Open external URL in user's default browser
  ipcMain.on('open-external', (event, url) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url);
    }
  });

  // Hide overlay window
  ipcMain.on('hide-overlay', () => {
    if (mainWindow) {
      mainWindow.hide();
    }
  });
}

// App lifecycle
app.whenReady().then(() => {
  startPythonWorker();
  createOverlayWindow();
  registerShortcuts();
  createTray();
  setupIPC();

  console.log('====================================================');
  console.log('  Halo (Circle to Search & Google AI Mode) Ready!');
  console.log('  Active Shortcuts:');
  console.log('    • [Ctrl + Alt + Z] (Primary)');
  console.log('    • [Ctrl + Shift + S] (Alternative 1)');
  console.log('    • [Ctrl + Alt + H] (Alternative 2)');
  console.log('  Or click the Halo icon in your System Tray!');
  console.log('====================================================');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (pythonProcess) {
    try {
      pythonProcess.kill();
    } catch (e) {
      // ignore
    }
  }
});

app.on('window-all-closed', (e) => {
  // Prevent quitting so background global shortcut & tray stay active
  e.preventDefault();
});
