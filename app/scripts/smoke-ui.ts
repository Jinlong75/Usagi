import { nativeImage, type BrowserWindow } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ChatService } from '../src/main/chat/service';
import { DeepSeekClient } from '../src/main/chat/client';
import type { Message, Session } from '../src/main/chat/types';
import type { UiController } from '../src/main/ipc/ui';

export function smokeDependencies() {
  const timestamp = new Date().toISOString();
  const session: Session = { sessionId: 'smoke', createdAt: timestamp, updatedAt: timestamp, messages: [] };
  const store = { load: async () => structuredClone(session), clear: async () => { session.messages = []; },
    append: async (message: Message) => { session.messages.push(message); } };
  // Exercise the production service, client, SSE parser and abort cleanup. This
  // fetch never opens a socket and never reads a real key or conversation.
  const fetcher: typeof fetch = async () => new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      for (const content of ['[开', '心]呀哈！', '今天也要', '元气满满！']) {
        await new Promise(resolve => setTimeout(resolve, 60));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n')); controller.close();
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } });
  const keys = { load: async () => ({ apiKey: 'smoke-placeholder', needsReentry: false }),
    save: async () => ({ persisted: true as const }) };
  const service = new ChatService({ client: new DeepSeekClient(fetcher), store, keyStore: keys,
    getSettings: () => ({ baseUrl: 'https://smoke.invalid', thinking: 'disabled' }) });
  return { service, store, keys };
}
async function settled(win: BrowserWindow, predicate: string): Promise<void> {
  await win.webContents.executeJavaScript(`new Promise((resolve,reject) => {
    const deadline = Date.now() + 5000;
    const check = () => { if (${predicate}) requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))); else if (Date.now() > deadline) reject(new Error('UI 未就绪')); else setTimeout(check, 16); }; check();
  })`);
}
/** Combine captures at actual desktop bounds, preserving the original alpha screenshots. */
async function capturePetBubble(pet: BrowserWindow, bubble: BrowserWindow, directory: string): Promise<void> {
  const windows = [pet, bubble]; const bounds = windows.map(win => win.getBounds());
  const x = Math.min(...bounds.map(b => b.x)), y = Math.min(...bounds.map(b => b.y));
  const width = Math.max(...bounds.map(b => b.x + b.width)) - x, height = Math.max(...bounds.map(b => b.y + b.height)) - y;
  const bitmap = Buffer.alloc(width * height * 4);
  for (let n = 0; n < windows.length; n++) {
    const capture = await windows[n]!.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    const source = capture.toBitmap({ scaleFactor: 1 }), size = capture.getSize(1), b = bounds[n]!;
    for (let row = 0; row < size.height; row++) for (let col = 0; col < size.width; col++) {
      const from = (row * size.width + col) * 4, to = ((row + b.y - y) * width + col + b.x - x) * 4;
      const alpha = source[from + 3]! / 255;
      for (let c = 0; c < 3; c++) bitmap[to + c] = Math.round(source[from + c]! + bitmap[to + c]! * (1 - alpha));
      bitmap[to + 3] = Math.round(source[from + 3]! + bitmap[to + 3]! * (1 - alpha));
    }
  }
  await writeFile(join(directory, 'smoke-bubble.png'), nativeImage.createFromBitmap(bitmap, { width, height, scaleFactor: 1 }).toPNG());
}
export async function captureUi(ui: UiController, pet: BrowserWindow, directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await ui.bubble.showBubble('呀哈！今天也要元气满满！', 5000);
  const bubble = ui.bubble.window!;
  await settled(bubble, "document.querySelector('#bubble')?.classList.contains('visible') && getComputedStyle(document.querySelector('#bubble')).opacity === '1'");
  await capturePetBubble(pet, bubble, directory);
  const chat = await ui.chat.open();
  await settled(chat, "document.querySelector('#status')?.textContent === '就绪' && !document.querySelector('#send').disabled");
  await chat.webContents.executeJavaScript(`document.querySelector('#input').value = '乌萨奇，今天开心吗？'; document.querySelector('#composer').requestSubmit();`);
  await settled(chat, "document.querySelector('#status')?.textContent === '就绪' && document.querySelector('.assistant')?.textContent === '😆 呀哈！今天也要元气满满！' && document.querySelector('.user')?.textContent === '乌萨奇，今天开心吗？'");
  await writeFile(join(directory, 'smoke-chat.png'), (await chat.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  const settings = await ui.settings.open(); settings.setSize(480, 1000);
  await settled(settings, "document.querySelector('#version')?.textContent.startsWith('版本 ') && document.querySelectorAll('section').length === 3");
  await writeFile(join(directory, 'smoke-settings.png'), (await settings.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
}
