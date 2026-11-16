import { screen, type BrowserWindow } from 'electron';
import { bubblePosition } from '../../shared/ui';
import { loadWindow, secureWindow } from './common';
export class BubbleWindow {
  private win?: BrowserWindow;
  private ready?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private hideTimer?: ReturnType<typeof setTimeout>;
  private text = '';
  private onAnswer?: () => Promise<void>;
  get questioning(): boolean { return !!this.onAnswer && this.visible; }
  private height = 72;
  private visible = false;
  private generation = 0;
  private chatUntil = 0;
  private headTop = 0;
  anchor(headTop: number): void { this.headTop = headTop; this.position(); }
  constructor(private pet: BrowserWindow, private root: string, private smoke: boolean) {
    pet.on('move', () => this.position()); pet.on('resize', () => this.position());
    pet.on('hide', () => this.hide());
  }
  get occupied(): boolean { return Date.now() < this.chatUntil; }
  get window(): BrowserWindow | undefined { return this.win; }
  private async ensure(): Promise<void> {
    if (this.ready) return this.ready;
    this.win = secureWindow('bubble', { width: 264, height: this.height, transparent: true, frame: false,
      focusable: false, acceptFirstMouse: true, resizable: false, hasShadow: false, skipTaskbar: true, alwaysOnTop: true, backgroundColor: '#00000000' }, this.smoke);
    this.win.setIgnoreMouseEvents(true);
    this.win.setAlwaysOnTop(true, 'floating');
    this.ready = loadWindow(this.win, 'bubble', this.root, this.smoke);
    return this.ready;
  }
  private position(): void {
    if (!this.win || this.win.isDestroyed()) return;
    const pet = this.pet.getBounds();
    const { side, ...bounds } = bubblePosition(pet, screen.getDisplayMatching(pet).workArea, 264, this.height, this.headTop);
    this.win.setBounds(bounds);
    this.win.webContents.send('bubble:text', { text: this.text, side, visible: this.visible, question: this.questioning });
  }
  resize(sender: Electron.WebContents, height: unknown): void {
    if (sender !== this.win?.webContents || typeof height !== 'number' || !Number.isFinite(height)) return;
    this.height = Math.max(48, Math.min(300, Math.ceil(height))); this.position();
  }
  async showBubble(text: string, durationMs = 3200, chat = false, onAnswer?: () => Promise<void>): Promise<void> {
    const generation = ++this.generation;
    clearTimeout(this.timer); clearTimeout(this.hideTimer);
    this.onAnswer = undefined;
    this.win?.setIgnoreMouseEvents(true);
    this.chatUntil = chat || onAnswer ? (durationMs === Infinity ? Infinity : Date.now() + durationMs) : 0;
    await this.ensure();
    if (generation !== this.generation) return;
    this.text = text; this.visible = true; this.onAnswer = onAnswer;
    this.win?.setIgnoreMouseEvents(!onAnswer); this.position();
    if (!this.smoke && this.pet.isVisible()) this.win?.showInactive();
    if (Number.isFinite(durationMs)) this.timer = setTimeout(() => this.hide(), durationMs);
  }
  hide(): void {
    ++this.generation; clearTimeout(this.timer); clearTimeout(this.hideTimer);
    this.visible = false; this.onAnswer = undefined; this.win?.setIgnoreMouseEvents(true);
    this.chatUntil = 0; this.position();
    this.hideTimer = setTimeout(() => this.win?.hide(), 150);
  }
  async answer(): Promise<void> {
    const action = this.onAnswer;
    if (!this.visible || !action) return;
    this.hide(); // Consume once before awaiting persistence or opening a window.
    await action();
  }
  destroy(): void { clearTimeout(this.timer); clearTimeout(this.hideTimer); if (this.win && !this.win.isDestroyed()) this.win.destroy(); }
}
