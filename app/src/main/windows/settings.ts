import { type BrowserWindow } from 'electron';
import { loadWindow, secureWindow } from './common';
export class SettingsWindow {
  window?: BrowserWindow;
  private ready?: Promise<void>;
  private closing = false;
  private saved?: () => void;
  constructor(private root: string, private smoke: boolean) {}
  async open(): Promise<BrowserWindow> {
    if (!this.window) {
      this.window = secureWindow('settings', { width: 480, height: 760, minWidth: 400, minHeight: 500,
        title: 'Usagi 设置', resizable: true }, this.smoke);
      this.window.on('close', event => {
        if (this.closing) return;
        event.preventDefault(); this.window?.webContents.send('settings:save-close');
      });
      this.ready = loadWindow(this.window, 'settings', this.root, this.smoke);
    }
    await this.ready;
    if (!this.smoke) this.window.show();
    return this.window;
  }
  closeReady(): void { this.window?.hide(); this.saved?.(); this.saved = undefined; }
  async saveBeforeQuit(): Promise<void> {
    if (!this.window?.isVisible()) return;
    await this.ready;
    return new Promise(resolve => { this.saved = resolve; this.window!.webContents.send('settings:save-close'); });
  }
  quit(): void { this.closing = true; }
}
