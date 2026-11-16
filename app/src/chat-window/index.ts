import { emotionEmoji, typewriterCount } from '../shared/ui';
import type { ChatEvent } from '../shared/ui';
import type { RoutineChatBridge } from '../shared/types';
import type { Emotion } from '../main/chat/types';
declare global { interface Window { chat: RoutineChatBridge } }
const messages = document.querySelector<HTMLElement>('#messages')!;
const input = document.querySelector<HTMLTextAreaElement>('#input')!;
const send = document.querySelector<HTMLButtonElement>('#send')!;
const clear = document.querySelector<HTMLButtonElement>('#clear')!;
const status = document.querySelector<HTMLElement>('#status')!;
let loaded = false;
let historyRevision = 0;
let active = false, target = '', shown = '', reply: HTMLElement | undefined;
let pendingEmoji: Emotion = 'neutral';
function scroll(): void { messages.scrollTop = messages.scrollHeight; }
function message(role: 'user' | 'assistant' | 'system', text: string, emotion: Emotion = 'neutral'): HTMLElement {
  const node = document.createElement('div'); node.className = `message ${role}`;
  const label = document.createElement('span'); label.className = 'content';
  label.textContent = role === 'assistant' ? `${emotionEmoji[emotion]} ${text}` : text;
  node.append(label); messages.append(node); scroll(); return label;
}
function busy(value: boolean, label: string): void {
  active = value; status.textContent = label; send.textContent = value ? '停止' : '发送'; clear.disabled = value;
}
function error(text: string, code?: string): void {
  const node = message('system', text);
  if (code === 'no_key') {
    const button = document.createElement('button'); button.textContent = '去设置'; button.onclick = () => window.chat.settings();
    node.append(document.createElement('br'), button);
  }
}
function ensureReply(): void { reply ??= message('assistant', '', pendingEmoji); }
function event(event: ChatEvent): void {
  if (event.type === 'status') busy(true, '正在想…');
  else if (event.type === 'delta') { busy(true, '回复中…'); target += event.text; ensureReply(); }
  else if (event.type === 'done') {
    target = event.text; pendingEmoji = event.emotion; ensureReply(); busy(false, '就绪');
  } else if (event.type === 'error') { busy(false, '出错了'); error(event.message, event.code); }
  else busy(false, '就绪');
}
const unsubscribe = window.chat.onEvent(event);
setInterval(() => {
  if (!reply) return;
  const remaining = Array.from(target).slice(Array.from(shown).length);
  if (remaining.length) shown += remaining.slice(0, typewriterCount(remaining.length)).join('');
  reply.textContent = `${emotionEmoji[pendingEmoji]} ${shown}`;
  if (remaining.length) scroll();
}, 16);
async function load(revision: number): Promise<boolean> {
  const snapshot = await window.chat.load();
  if (revision !== historyRevision) return false;
  messages.replaceChildren();
  for (const msg of snapshot.session.messages) message(msg.role, msg.content, msg.emotion);
  target = snapshot.active ? snapshot.text : ''; shown = target; reply = undefined;
  if (snapshot.active && target) { ensureReply(); reply!.textContent = `${emotionEmoji.neutral} ${target}`; }
  busy(snapshot.active, snapshot.active ? (target ? '回复中…' : '正在想…') : '就绪');
  return true;
}
async function refresh(): Promise<void> {
  const revision = ++historyRevision;
  loaded = false; send.disabled = true;
  try { if (await load(revision)) { loaded = true; send.disabled = false; } }
  catch { if (revision === historyRevision) error('聊天记录加载失败，请检查文件权限。'); }
}
const unsubscribeHistory = window.chat.onHistoryChanged(() => { void refresh(); });
async function submit(): Promise<void> {
  if (!loaded) return;
  if (active) { await window.chat.stop(); return; }
  const text = input.value.trim(); if (!text) return;
  // Finish the previous typewriter before creating the next reply.
  if (reply) reply.textContent = `${emotionEmoji[pendingEmoji]} ${target}`;
  target = ''; shown = ''; reply = undefined; pendingEmoji = 'neutral';
  message('user', text); input.value = ''; busy(true, '正在想…');
  try { const result = await window.chat.send(text); if (result.message) { busy(false, '出错了'); error(result.message); } }
  catch { busy(false, '出错了'); error('消息发送失败，请稍后重试。'); }
}
document.querySelector('#composer')!.addEventListener('submit', e => { e.preventDefault(); void submit(); });
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!active) void submit(); }
});
clear.onclick = async () => { if (await window.chat.clear()) await refresh(); };
window.addEventListener('unload', unsubscribe);
window.addEventListener('unload', unsubscribeHistory);
void refresh();
