import { join } from 'node:path';
import electron from 'electron';
import { getMapRotation } from './mapService';

const { app, BrowserWindow, ipcMain, screen, shell } = electron;
const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const WINDOW_WIDTH = 360;
const WINDOW_HEIGHT = 260;
const COMPACT_WINDOW_WIDTH = 300;
const COMPACT_WINDOW_HEIGHT = 96;
const WINDOW_MARGIN = 14;

let compactDragState: {
  windowId: number;
  startCursorX: number;
  startCursorY: number;
  startWindowX: number;
  startWindowY: number;
} | null = null;

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
    backgroundColor: '#00000000',
    transparent: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
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
  ipcMain.handle('window:compact', (event, compact?: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;

    const width = compact ? COMPACT_WINDOW_WIDTH : WINDOW_WIDTH;
    const height = compact ? COMPACT_WINDOW_HEIGHT : WINDOW_HEIGHT;
    const { workArea } = screen.getDisplayMatching(window.getBounds());
    const x = workArea.x + workArea.width - width - WINDOW_MARGIN;
    const y = workArea.y + workArea.height - height - WINDOW_MARGIN;

    window.setResizable(true);
    window.setMinimumSize(1, 1);
    window.setMaximumSize(10_000, 10_000);
    const bounds = { x, y, width, height };
    window.setContentBounds(bounds, false);
    window.setBounds(bounds, false);
    window.setMinimumSize(width, height);
    window.setMaximumSize(width, height);
    window.setResizable(false);
  });
  ipcMain.handle('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
  ipcMain.handle('window:drag-start', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;

    const cursor = screen.getCursorScreenPoint();
    const bounds = window.getBounds();
    compactDragState = {
      windowId: window.id,
      startCursorX: cursor.x,
      startCursorY: cursor.y,
      startWindowX: bounds.x,
      startWindowY: bounds.y
    };
  });
  ipcMain.handle('window:drag-move', () => {
    if (!compactDragState) return;

    const window = BrowserWindow.fromId(compactDragState.windowId);
    if (!window) return;

    const cursor = screen.getCursorScreenPoint();
    window.setPosition(
      compactDragState.startWindowX + cursor.x - compactDragState.startCursorX,
      compactDragState.startWindowY + cursor.y - compactDragState.startCursorY,
      false
    );
  });
  ipcMain.handle('window:drag-end', () => {
    compactDragState = null;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
