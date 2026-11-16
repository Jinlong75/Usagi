import { BrowserWindow } from 'electron';
import { join } from 'node:path';
export function secureWindow(kind: string, options: Electron.BrowserWindowConstructorOptions, smoke: boolean): BrowserWindow {
  const win = new BrowserWindow({ ...options, show: false, webPreferences: {
    preload: join(__dirname, `${kind}-preload.cjs`), contextIsolation: true, nodeIntegration: false,
    sandbox: true, offscreen: smoke, backgroundThrottling: false,
  } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  return win;
}
export async function loadWindow(win: BrowserWindow, kind: string, root: string, smoke: boolean): Promise<void> {
  if (!smoke && process.env.USAGI_DEV_URL) await win.loadURL(new URL(`${kind}.html`, process.env.USAGI_DEV_URL).href);
  else await win.loadFile(join(root, 'app/dist', `${kind}.html`));
}
