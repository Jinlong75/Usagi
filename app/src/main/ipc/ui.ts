import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import type { ChatService, ChatEvent } from '../chat/service';
import { maskKey } from '../chat/keyStore';
import type { KeyResult, SaveKeyResult } from '../chat/keyStore';
import type { Session } from '../chat/types';
import type { Config } from '../../shared/types';
import { emotionExpression, preview } from '../../shared/ui';
import { BubbleWindow } from '../windows/bubble';
import { ChatWindow } from '../windows/chat';
import { SettingsWindow } from '../windows/settings';
import { questionText } from '../routine';
export interface ChatPort {
  // The smoke service has no routine scheduler or persistence.
  appendAssistant?: ChatService['appendAssistant'];
  send: ChatService['send']; stop: ChatService['stop']; testConnection: ChatService['testConnection']; onEvent: ChatService['onEvent'];
}
export interface UiOptions {
  pet: BrowserWindow; root: string; smoke: boolean;
  config(): Config; update(config: unknown): void;
  keys: { load(): Promise<KeyResult>; save(key: string): Promise<SaveKeyResult> };
  store: { load(): Promise<Session>; clear(): Promise<void> };
  service: ChatPort;
}
export class UiController {
  bubble: BubbleWindow;
  chat: ChatWindow;
  settings: SettingsWindow;
  active = false;
  text = '';
  private lastBubble = -Infinity;
  private streamTimer?: ReturnType<typeof setTimeout>;
  private requestId?: string;
  private disposed = false;
  private unsubscribe: () => void;
  constructor(private options: UiOptions) {
    this.bubble = new BubbleWindow(options.pet, options.root, options.smoke);
    this.chat = new ChatWindow(options.pet, options.root, options.smoke);
    this.settings = new SettingsWindow(options.root, options.smoke);
    this.unsubscribe = options.service.onEvent(event => this.event(event));
    const trusted = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent, win?: BrowserWindow) =>
      !!win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;
    const handle = (name: string, window: () => BrowserWindow | undefined, callback: (...args: any[]) => unknown) => {
      ipcMain.handle(name, (event, ...args) => {
        if (!trusted(event, window())) throw new Error('未授权的请求');
        return callback(...args);
      });
    };
    handle('chat:load', () => this.chat.window, async () => ({ session: await options.store.load(), active: this.active, text: this.text }));
    handle('chat:send', () => this.chat.window, (text: unknown) => this.send(text));
    handle('chat:stop', () => this.chat.window, () => { options.service.stop(); });
    handle('chat:clear', () => this.chat.window, async () => {
      if (this.active) return false;
      const result = await dialog.showMessageBox(this.chat.window!, { type: 'question', message: '确定清空对话吗？',
        detail: '清空后无法恢复。', buttons: ['取消', '清空对话'], defaultId: 0, cancelId: 0 });
      if (result.response !== 1 || this.active) return false;
      await options.store.clear(); this.text = ''; return true;
    });
    ipcMain.on('chat:settings', event => { if (trusted(event, this.chat.window)) void this.settings.open(); });
    handle('settings:load', () => this.settings.window, async () => {
      const key = await options.keys.load();
      return { config: options.config(), maskedKey: key.apiKey ? maskKey(key.apiKey) : '', needsReentry: key.needsReentry, version: app.getVersion() };
    });
    handle('settings:reveal', () => this.settings.window, async () => (await options.keys.load()).apiKey);
    handle('settings:save', () => this.settings.window, async (config: unknown, key: unknown) => {
      try {
        if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('设置格式不正确');
        const settings = config as Partial<Config>;
        // The settings page owns these controls only; tray-owned switches cannot be rewound by a stale snapshot.
        options.update({ ...options.config(), chat: settings.chat, selfTalk: settings.selfTalk, volume: settings.volume, routine: settings.routine });
        const saved = typeof key === 'string' ? await options.keys.save(key.trim()) : undefined;
        const loaded = await options.keys.load();
        return { ok: true, config: options.config(), key: saved, maskedKey: loaded.apiKey ? maskKey(loaded.apiKey) : '' };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
    });
    handle('settings:test', () => this.settings.window, () => options.service.testConnection());
    ipcMain.on('settings:close-ready', event => { if (trusted(event, this.settings.window)) this.settings.closeReady(); });
    handle('bubble:answer', () => this.bubble.window, () => this.bubble.answer());
    ipcMain.on('bubble:resize', (event, height: unknown) => {
      if (trusted(event, this.bubble.window)) this.bubble.resize(event.sender, height);
    });
  }
  get blocked(): boolean { return this.active || !!this.chat.window?.isVisible() || !!this.settings.window?.isVisible(); }
  async showRoutine(text: string, duration: number, question: boolean): Promise<void> {
    await this.bubble.showBubble(text, duration, false, question ? async () => {
      if (this.active) return;
      try {
        if (!this.options.service.appendAssistant) throw new Error('聊天记录存储不可用');
        await this.options.service.appendAssistant(questionText(text));
        // Refresh the persisted question without replacing an existing page or its draft.
        this.chat.window?.webContents.send('chat:history-changed');
        await this.chat.open();
      } catch (error) {
        await this.bubble.showBubble(error instanceof Error ? error.message : '聊天记录保存失败，请稍后重试。', 4000);
      }
    } : undefined);
  }
  send(text: unknown): { requestId?: string; message?: string } {
    if (typeof text !== 'string' || !text.trim() || text.length > 100000) return { message: '请输入 1～100000 字的消息。' };
    if (this.active) return { message: '正在回复上一条消息，请稍等或先停止。' };
    try {
      this.text = ''; this.active = true;
      this.requestId = this.options.service.send(text);
      this.lastBubble = -Infinity;
      void this.bubble.showBubble('嗯……让我想想', Infinity, true);
      return { requestId: this.requestId };
    } catch { this.active = false; return { message: '暂时无法发送消息，请稍后重试。' }; }
  }
  private streamingBubble(): void {
    this.lastBubble = Date.now(); void this.bubble.showBubble(preview(this.text), Infinity, true);
  }
  private event(event: ChatEvent): void {
    if (this.requestId && this.requestId !== event.requestId) return;
    this.chat.window?.webContents.send('chat:event', event);
    if (event.type === 'delta') {
      this.text += event.text;
      if (Date.now() - this.lastBubble >= 200) { clearTimeout(this.streamTimer); this.streamTimer = undefined; this.streamingBubble(); }
      else if (!this.streamTimer) this.streamTimer = setTimeout(() => {
        this.streamTimer = undefined; this.streamingBubble();
      }, 200 - (Date.now() - this.lastBubble));
    } else if (event.type === 'done' || event.type === 'error' || event.type === 'stopped') {
      clearTimeout(this.streamTimer); this.streamTimer = undefined; this.active = false;
      if (event.type === 'done') {
        this.text = event.text; void this.bubble.showBubble(preview(event.text), 5000, true);
        const expression = emotionExpression(event.emotion);
        if (expression) this.options.pet.webContents.send('pet:expression', expression);
        if (Math.random() < 0.5) this.options.pet.webContents.send('pet:play-sound', 'chat_reply');
      } else if (event.type === 'error') void this.bubble.showBubble(preview(event.message, 80), 4000, true);
      else this.bubble.hide();
    }
  }
  broadcast(): void {
    for (const win of [this.options.pet, this.bubble.window, this.chat.window, this.settings.window]) {
      if (win && !win.isDestroyed()) win.webContents.send('config:changed', this.options.config());
    }
  }
  stopChat(): void { this.options.service.stop(); }
  quit(): void { if (this.disposed) return; this.disposed = true; this.options.service.stop(); this.unsubscribe(); clearTimeout(this.streamTimer); this.chat.quit(); this.settings.quit(); this.bubble.destroy(); }
}
