import { app, BrowserWindow, ipcMain } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { memorySnapshot } from '../src/main/crashLog';
import type { UiController } from '../src/main/ipc/ui';
import { validChatRounds } from './smoke-chat-report.mjs';

function listeners(emitter: NodeJS.EventEmitter): Record<string, number> {
  return Object.fromEntries(emitter.eventNames().map(String).sort().map(name => [name, emitter.listenerCount(name)]));
}
export async function checkChatRounds(ui: UiController, counts: { renderGone: number; childGone: number }) {
  const chat = await ui.chat.open();
  const rounds = [];
  const readChatLog = async () => (await readFile(join(app.getPath('userData'), 'crash.log'), 'utf8')).split('\n')
    .filter(line => /^\S+ chat /.test(line)).map(line => JSON.parse(line.slice(line.indexOf(' chat ') + 6)));
  const initialLogs = (await readChatLog()).length;
  const initialMessages = await chat.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const check = () => !document.querySelector('#send').disabled && document.querySelector('#status').textContent === '就绪'
      ? resolve(document.querySelectorAll('.user').length) : Date.now() > deadline ? reject(new Error('聊天页未就绪')) : setTimeout(check, 16);
    check();
  })`);
  for (let round = 1; round <= 12; round++) {
    // The real composer calls preload -> ipcRenderer.invoke -> trusted ipcMain
    // handler. Waiting for the rendered answer also proves event delivery.
    await chat.webContents.executeJavaScript(`(async () => {
      const wait = predicate => new Promise((resolve, reject) => {
        const deadline = Date.now() + 5000;
        const check = () => predicate() ? resolve() : Date.now() > deadline ? reject(new Error('第 ${round} 轮聊天未完成')) : setTimeout(check, 16);
        check();
      });
      await wait(() => !document.querySelector('#send').disabled && document.querySelector('#status').textContent === '就绪');
      document.querySelector('#input').value = '${round}';
      document.querySelector('#composer').requestSubmit();
      await wait(() => document.querySelector('#status').textContent === '就绪' &&
        document.querySelectorAll('.user').length === ${initialMessages + round} &&
        [...document.querySelectorAll('.assistant')].at(-1)?.textContent === '😆 呀哈！今天也要元气满满！');
    })()`);
    if (ui.active) throw new Error(`第 ${round} 轮主进程仍在回复`);
    const windows = BrowserWindow.getAllWindows().sort((a, b) => a.id - b.id);
    const sample = { round, windows: windows.length, ipc: listeners(ipcMain),
      webContents: windows.map(win => ({ id: win.webContents.id, listeners: listeners(win.webContents) })),
      ...counts, memory: memorySnapshot(app) };
    rounds.push(sample);
    console.log(JSON.stringify({ chatRound: sample }));
    const logs = await readChatLog();
    const last = logs.at(-1);
    if (logs.length !== initialLogs + round || last?.round !== initialLogs + round || last.error !== false ||
        !Number.isFinite(last.durationMs) || Object.keys(last).sort().join(',') !== 'durationMs,error,round') {
      throw new Error(`第 ${round} 轮缺少持久聊天诊断或诊断包含多余字段`);
    }
    if (sample.renderGone || sample.childGone) throw new Error(`第 ${round} 轮有进程退出`);
  }
  if (!validChatRounds(rounds)) throw new Error('12 轮聊天窗口或监听器数量增长');
  await writeFile(join(app.getPath('userData'), 'chat-rounds.json'), JSON.stringify(rounds, null, 2));
  return rounds;
}
