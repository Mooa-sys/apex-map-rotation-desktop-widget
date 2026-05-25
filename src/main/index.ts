import { join } from 'node:path';
import electron from 'electron';
import { getMapRotation } from './mapService';

const { app, BrowserWindow, ipcMain, screen, shell } = electron;
const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const WINDOW_WIDTH = 360;
const WINDOW_HEIGHT = 260;
const WINDOW_MARGIN = 14;

function createWindow(): void {
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_WIDTH,
    minHeight: WINDOW_HEIGHT,
    maxWidth: WINDOW_WIDTH,
    maxHeight: WINDOW_HEIGHT,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    show: false,
    title: 'Apex Map Change',
    backgroundColor: '#111317',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.once('ready-to-show', () => {
    const { workArea } = screen.getPrimaryDisplay();
    window.setPosition(
      workArea.x + workArea.width - WINDOW_WIDTH - WINDOW_MARGIN,
      workArea.y + workArea.height - WINDOW_HEIGHT - WINDOW_MARGIN
    );
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  ipcMain.handle('map-rotation:get', (_event, force?: boolean) => getMapRotation(Boolean(force)));
  ipcMain.handle('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.handle('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
