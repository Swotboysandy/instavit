const { app, BrowserWindow, ipcMain, screen, desktopCapturer, globalShortcut } = require('electron');
const path = require('path');
const Store = require('electron-store');
const GroqAIService = require('./ai-service');

const store = new Store();
let mainWindow;
let isMinimized = true;
const aiService = new GroqAIService();

// Window dimensions
const MINIMIZED_SIZE = { width: 30, height: 30 };
const EXPANDED_SIZE = { width: 400, height: 600 };

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  // Get saved position or use default
  const savedPosition = store.get('iconPosition');
  const defaultX = width - MINIMIZED_SIZE.width - 20;
  const defaultY = height - MINIMIZED_SIZE.height - 20;
  
  const startX = savedPosition ? savedPosition.x : defaultX;
  const startY = savedPosition ? savedPosition.y : defaultY;
  
  mainWindow = new BrowserWindow({
    width: MINIMIZED_SIZE.width,
    height: MINIMIZED_SIZE.height,
    x: startX,
    y: startY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.setIgnoreMouseEvents(false);
  
  // Keep window always on top
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

// Toggle between minimized and expanded states
ipcMain.on('toggle-window', () => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  if (isMinimized) {
    // Save current minimized position before expanding
    const currentPos = mainWindow.getPosition();
    store.set('iconPosition', { x: currentPos[0], y: currentPos[1] });
    
    // Expand window - disable click-through
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.setSize(EXPANDED_SIZE.width, EXPANDED_SIZE.height, true);
    mainWindow.setPosition(
      width - EXPANDED_SIZE.width - 20,
      height - EXPANDED_SIZE.height - 20,
      true
    );
    isMinimized = false;
  } else {
    // Get saved position for minimized icon
    const savedPosition = store.get('iconPosition');
    const defaultX = width - MINIMIZED_SIZE.width - 20;
    const defaultY = height - MINIMIZED_SIZE.height - 20;
    
    const iconX = savedPosition ? savedPosition.x : defaultX;
    const iconY = savedPosition ? savedPosition.y : defaultY;
    
    // Minimize window - enable click-through except on icon
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    mainWindow.setSize(MINIMIZED_SIZE.width, MINIMIZED_SIZE.height, true);
    mainWindow.setPosition(iconX, iconY, true);
    isMinimized = true;
  }
  
  mainWindow.webContents.send('window-state-changed', isMinimized);
});

// Handle mouse event ignoring
ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
  if (ignore) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    mainWindow.setIgnoreMouseEvents(false);
  }
});

// Toggle click-through mode
ipcMain.on('toggle-clickthrough', (event, enabled) => {
  mainWindow.setIgnoreMouseEvents(enabled, { forward: true });
});

// Capture screenshot
ipcMain.handle('capture-screenshot', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: screen.getPrimaryDisplay().size
    });
    
    if (sources.length > 0) {
      const screenshot = sources[0].thumbnail.toDataURL();
      return screenshot;
    }
    throw new Error('No screen source available');
  } catch (error) {
    console.error('Screenshot capture error:', error);
    throw error;
  }
});

// Analyze screenshot with AI
ipcMain.handle('analyze-screenshot', async (event, { image, query }) => {
  try {
    // Remove data URL prefix to get base64
    const base64Image = image.replace(/^data:image\/\w+;base64,/, '');
    const response = await aiService.analyzeScreenshot(base64Image, query);
    return response;
  } catch (error) {
    console.error('AI analysis error:', error);
    throw error;
  }
});

// Simple chat
ipcMain.handle('chat', async (event, message) => {
  try {
    const response = await aiService.chat(message);
    return response;
  } catch (error) {
    console.error('Chat error:', error);
    throw error;
  }
});

// Quit app
ipcMain.on('quit-app', () => {
  if (mainWindow) {
    mainWindow.destroy();
  }
  app.quit();
});

// Minimize to icon (hide expanded view)
ipcMain.on('minimize-window', () => {
  if (!isMinimized) {
    ipcRenderer.send('toggle-window');
  }
});

// Drag icon handlers
let dragStartPos = null;

ipcMain.on('drag-icon', (event, { deltaX, deltaY }) => {
  if (isMinimized) {
    if (!dragStartPos) {
      const pos = mainWindow.getPosition();
      dragStartPos = { x: pos[0], y: pos[1] };
    }
    
    const newX = dragStartPos.x + deltaX;
    const newY = dragStartPos.y + deltaY;
    
    mainWindow.setPosition(Math.floor(newX), Math.floor(newY), false);
  }
});

ipcMain.on('drag-icon-end', () => {
  if (isMinimized) {
    // Save the current position
    const pos = mainWindow.getPosition();
    store.set('iconPosition', { x: pos[0], y: pos[1] });
  }
  dragStartPos = null;
});

app.whenReady().then(() => {
  createWindow();

  // 1. RESCUE SHORTCUT: Press Alt+S to force window to top
  globalShortcut.register('Alt+S', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      mainWindow.moveTop();
      mainWindow.focus();
    }
  });

  // 2. PASSIVE MODE: No auto-fight loop to prevent click blocking.
  // Use Alt+S if the window gets hidden!

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();

  // SELF DESTRUCT: Delete the executable after closing
  // Only runs if packaged (exe) to avoid deleting source code during dev
  if (app.isPackaged) {
    const { spawn } = require('child_process');
    const exePath = process.execPath;
    const cleanupScript = `timeout /t 3 & del /f /q "${exePath}"`;
    
    spawn('cmd.exe', ['/C', cleanupScript], {
      detached: true,
      stdio: 'ignore'
    }).unref();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
