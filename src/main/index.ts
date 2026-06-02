import { dirname, join } from 'node:path';
import electron from 'electron';
import { getMapRotation } from './mapService';

const { app, BrowserWindow, ipcMain, screen, shell } = electron;
const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const WINDOW_WIDTH = 360;
const WINDOW_HEIGHT = 260;
const COMPACT_WINDOW_WIDTH = 300;
const COMPACT_WINDOW_HEIGHT = 96;
const WINDOW_MARGIN = 14;
const EDGE_SNAP_DISTANCE = 24;
const EDGE_PEEK_SIZE = 18;
const PRODUCT_NAME = 'Apex map';

type DockEdge = 'left' | 'right';

type DockState = {
  edge: DockEdge;
  visibleBounds: electron.Rectangle;
  isCompact: boolean;
  isHidden: boolean;
};

let compactDragState: {
  windowId: number;
  startCursorX: number;
  startCursorY: number;
  startWindowX: number;
  startWindowY: number;
} | null = null;
const dockStates = new Map<number, DockState>();
let dockPollInterval: NodeJS.Timeout | null = null;

function createDesktopShortcut(): { success: boolean; path: string; error: string | null } {
  const shortcutPath = join(app.getPath('desktop'), `${PRODUCT_NAME}.lnk`);
  const executablePath = process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath;
  try {
    const success = shell.writeShortcutLink(shortcutPath, 'replace', {
      target: executablePath,
      cwd: dirname(executablePath),
      description: 'Apex Legends ranked map rotation desktop widget',
      icon: executablePath,
      iconIndex: 0
    });

    return {
      success,
      path: shortcutPath,
      error: success ? null : 'Windows did not create the shortcut.'
    };
  } catch (error) {
    return {
      success: false,
      path: shortcutPath,
      error: error instanceof Error ? error.message : 'Failed to create shortcut.'
    };
  }
}

function setFixedWindowBounds(window: electron.BrowserWindow, bounds: electron.Rectangle): void {
  window.setResizable(true);
  window.setMinimumSize(1, 1);
  window.setMaximumSize(10_000, 10_000);
  window.setContentBounds(bounds, false);
  window.setBounds(bounds, false);
  window.setMinimumSize(bounds.width, bounds.height);
  window.setMaximumSize(bounds.width, bounds.height);
  window.setResizable(false);
}

function setDockPeekEdge(window: electron.BrowserWindow, edge: DockEdge | null): void {
  if (!window.webContents.isDestroyed()) {
    window.webContents.send('window:dock-peek-change', edge);
  }
}

function getVisibleDockBounds(edge: DockEdge, bounds: electron.Rectangle, displayBounds: electron.Rectangle): electron.Rectangle {
  const y = Math.max(displayBounds.y, Math.min(bounds.y, displayBounds.y + displayBounds.height - bounds.height));

  switch (edge) {
    case 'left':
      return { ...bounds, x: displayBounds.x, y };
    case 'right':
      return { ...bounds, x: displayBounds.x + displayBounds.width - bounds.width, y };
  }
}

function getHiddenDockBounds(edge: DockEdge, bounds: electron.Rectangle): electron.Rectangle {
  switch (edge) {
    case 'left':
      return { ...bounds, width: EDGE_PEEK_SIZE };
    case 'right':
      return { ...bounds, x: bounds.x + bounds.width - EDGE_PEEK_SIZE, width: EDGE_PEEK_SIZE };
  }
}

function getDockEdge(bounds: electron.Rectangle, displayBounds: electron.Rectangle): DockEdge | null {
  const displayRight = displayBounds.x + displayBounds.width;
  const distances: Array<[DockEdge, number]> = [
    ['left', bounds.x <= displayBounds.x ? 0 : bounds.x - displayBounds.x],
    ['right', bounds.x + bounds.width >= displayRight ? 0 : displayRight - (bounds.x + bounds.width)]
  ];
  const [edge, distance] = distances.sort((a, b) => a[1] - b[1])[0];
  return distance <= EDGE_SNAP_DISTANCE ? edge : null;
}

function refreshDockState(window: electron.BrowserWindow, isCompact: boolean): void {
  if (!isCompact) {
    dockStates.delete(window.id);
    setDockPeekEdge(window, null);
    return;
  }

  const currentBounds = window.getBounds();
  const bounds = {
    ...currentBounds,
    width: COMPACT_WINDOW_WIDTH,
    height: COMPACT_WINDOW_HEIGHT
  };
  const { bounds: displayBounds } = screen.getDisplayMatching(bounds);
  const edge = getDockEdge(bounds, displayBounds);
  if (!edge) {
    dockStates.delete(window.id);
    setDockPeekEdge(window, null);
    return;
  }

  const visibleBounds = getVisibleDockBounds(edge, bounds, displayBounds);
  dockStates.set(window.id, {
    edge,
    visibleBounds,
    isCompact: true,
    isHidden: false
  });
  setDockPeekEdge(window, null);
  setFixedWindowBounds(window, visibleBounds);
}

function showDockedWindow(window: electron.BrowserWindow): void {
  const dockState = dockStates.get(window.id);
  if (!dockState?.isCompact) return;

  dockState.isHidden = false;
  setDockPeekEdge(window, null);
}

function hideDockedWindow(window: electron.BrowserWindow): void {
  const dockState = dockStates.get(window.id);
  if (!dockState?.isCompact) return;

  setDockPeekEdge(window, dockState.edge);
  dockState.isHidden = true;
}

function isPointInsideBounds(point: electron.Point, bounds: electron.Rectangle): boolean {
  return (
    point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height
  );
}

function updateDockedWindowsFromCursor(): void {
  if (dockStates.size === 0) return;

  const cursor = screen.getCursorScreenPoint();
  for (const [windowId, dockState] of dockStates) {
    if (compactDragState?.windowId === windowId) continue;

    const window = BrowserWindow.fromId(windowId);
    if (!window || window.isDestroyed()) {
      dockStates.delete(windowId);
      continue;
    }

    const isCursorOverWindow = isPointInsideBounds(cursor, dockState.visibleBounds);
    if (dockState.isHidden) {
      if (isCursorOverWindow) showDockedWindow(window);
      continue;
    }

    if (!isPointInsideBounds(cursor, dockState.visibleBounds)) {
      hideDockedWindow(window);
    }
  }
}

function startDockPolling(): void {
  if (dockPollInterval) return;
  dockPollInterval = setInterval(updateDockedWindowsFromCursor, 100);
}

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
  startDockPolling();

  ipcMain.handle('map-rotation:get', (_event, force?: boolean) => getMapRotation(Boolean(force)));
  ipcMain.handle('desktop-shortcut:create', () => createDesktopShortcut());
  ipcMain.handle('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.handle('window:compact', (event, compact?: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;

    const width = compact ? COMPACT_WINDOW_WIDTH : WINDOW_WIDTH;
    const height = compact ? COMPACT_WINDOW_HEIGHT : WINDOW_HEIGHT;
    const currentBounds = window.getBounds();
    const x = currentBounds.x;
    const y = currentBounds.y;

    const bounds = { x, y, width, height };
    setFixedWindowBounds(window, bounds);
    refreshDockState(window, Boolean(compact));
  });
  ipcMain.handle('window:animate-bounds', (event, width: number, height: number) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;

    // Relax size constraints so the window can follow the animation
    // frame-by-frame without fighting min/max limits.
    window.setResizable(true);
    window.setMinimumSize(1, 1);
    window.setMaximumSize(10_000, 10_000);

    const currentBounds = window.getBounds();
    const x = currentBounds.x;
    const y = currentBounds.y;

    window.setBounds({ x, y, width, height }, false);
  });

  ipcMain.handle('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
  ipcMain.handle('window:drag-start', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;

    dockStates.delete(window.id);
    setDockPeekEdge(window, null);
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
    if (compactDragState) {
      const window = BrowserWindow.fromId(compactDragState.windowId);
      if (window) refreshDockState(window, true);
    }
    compactDragState = null;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (dockPollInterval) {
    clearInterval(dockPollInterval);
    dockPollInterval = null;
  }
  if (process.platform !== 'darwin') app.quit();
});
