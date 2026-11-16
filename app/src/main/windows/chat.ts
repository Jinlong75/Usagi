import { screen, type BrowserWindow } from 'electron';
import { companionBounds } from '../../shared/ui';
import { loadWindow, secureWindow } from './common';
export class ChatWindow {
  window?: BrowserWindow;
  private ready?: Promise<void>;
  private closing = false;
  constructor(private pet: BrowserWindow, private root: string, private smoke: boolean) {}
  async open(): Promise<BrowserWindow> {
    if (!this.window) {
      const pet = this.pet.getBounds();
      this.window = secureWindow('chat', { ...companionBounds(pet, screen.getDisplayMatching(pet).workArea, 360, 520),
        title: '乌萨奇', minWidth: 320, minHeight: 400, resizable: true, hasShadow: true }, this.smoke);
      this.window.on('close', event => { if (!this.closing) { event.preventDefault(); this.window?.hide(); } });
      this.ready = loadWindow(this.window, 'chat', this.root, this.smoke);
    }
    await this.ready;
    if (!this.smoke) this.window.show();
    return this.window;
  }
  quit(): void { this.closing = true; }
}
