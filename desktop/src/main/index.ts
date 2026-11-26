import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, nativeTheme } from 'electron';
import type { StreamEvent } from '../shared/types.js';
import { registerIpcHandlers } from './ipc/register.js';
import { ProjectStore } from './pi/project-store.js';
import { SessionHub } from './pi/session-hub.js';
import { TerminalHub } from './terminal/terminal-hub.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
const projectStore = new ProjectStore();

function broadcastEvent(event: StreamEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shannon:event', event);
  }
}

const sessionHub = new SessionHub(projectStore, broadcastEvent, undefined, async (options) => {
  if (!mainWindow || mainWindow.isDestroyed()) return undefined;
  return (await dialog.showMessageBox(mainWindow, options)).response;
});

const terminalHub = new TerminalHub(
  (terminalId, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('shannon:terminal-data', { terminalId, data });
    }
  },
  (terminalId, exitCode) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('shannon:terminal-exit', { terminalId, exitCode });
    }
  },
);

function createWindow(): BrowserWindow {
  const themePref = projectStore.getTheme();
  const isDark =
    themePref === 'dark' || (themePref === 'system' && nativeTheme.shouldUseDarkColors);

  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: 'Shannon',
    backgroundColor: isDark ? '#161617' : '#FAF9F5',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 15 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  return win;
}

void app.whenReady().then(() => {
  registerIpcHandlers(() => mainWindow, projectStore, sessionHub, terminalHub);
  mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('before-quit', () => {
  terminalHub.disposeAll();
  void sessionHub.disposeAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
