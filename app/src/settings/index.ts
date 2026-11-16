import type { SettingsBridge } from '../shared/ui';
import type { Config } from '../shared/types';
declare global { interface Window { settings: SettingsBridge } }
const field = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T;
const value = (id: string) => field<HTMLInputElement>(id);
const key = value('key'), warning = field('key-warning'), status = field('save-status');
let config: Config;
let dirtyKey = false, revealed = false, loaded = false;
let maskedKey = '';
let saveQueue: Promise<unknown> = Promise.resolve();
function syncCustom(): void { field('custom-label').hidden = value('model').value !== 'custom'; }
function display(next: Config): void {
  config = next;
  value('model').value = ['deepseek-flash', 'deepseek-v4-pro'].includes(next.chat.model) ? next.chat.model : 'custom';
  value('custom-model').value = next.chat.model; value('base-url').value = next.chat.baseUrl;
  value('temperature').value = String(next.chat.temperature); value('thinking').checked = next.chat.thinking === 'enabled';
  value('self-talk').checked = next.selfTalk.enabled; value('min-sec').value = String(next.selfTalk.minSec);
  value('max-sec').value = String(next.selfTalk.maxSec); value('lines').value = next.selfTalk.lines.join('\n');
  value('volume').value = String(next.volume); syncCustom(); outputs();
}
function outputs(): void {
  field('temperature-value').textContent = value('temperature').value;
  field('volume-value').textContent = `${Math.round(Number(value('volume').value) * 100)}%`;
}
function collect(): Config {
  return { ...config, chat: { ...config.chat,
    model: value('model').value === 'custom' ? value('custom-model').value.trim() : value('model').value,
    baseUrl: value('base-url').value.trim(), temperature: Number(value('temperature').value),
    thinking: value('thinking').checked ? 'enabled' : 'disabled' },
    selfTalk: { enabled: value('self-talk').checked, minSec: Number(value('min-sec').value),
      maxSec: Number(value('max-sec').value), lines: value('lines').value.split('\n') }, volume: Number(value('volume').value) };
}
function save(): Promise<void> {
  if (!loaded) return Promise.resolve();
  const next = collect(), secret = dirtyKey ? key.value : undefined;
  const operation = saveQueue.then(async () => {
    const result = await window.settings.save(next, secret);
    if (!result.ok) throw new Error(result.reason);
    config = result.config;
    if (secret !== undefined && key.value === secret) {
      dirtyKey = false; revealed = false; key.type = 'password'; maskedKey = result.maskedKey; key.value = ''; key.placeholder = maskedKey || '输入 API Key'; field('reveal').textContent = '显示';
    }
    if (result.key) warning.textContent = result.key.persisted ? '' : result.key.reason;
    status.classList.remove('error'); status.textContent = '已保存，立即生效';
  });
  const reported = operation.catch(error => {
    const reason = error instanceof Error ? error.message : String(error);
    status.classList.add('error');
    status.textContent = `设置保存失败：${reason}。请检查磁盘空间和文件权限。`;
    throw error;
  });
  saveQueue = reported.catch(() => {}); return reported;
}
key.addEventListener('input', () => { dirtyKey = true; });
field('reveal').onclick = async () => {
  if (!revealed) {
    if (!dirtyKey) key.value = await window.settings.revealKey();
    key.type = 'text'; revealed = true; field('reveal').textContent = '隐藏';
  } else { key.type = 'password'; if (!dirtyKey) { key.value = ''; key.placeholder = maskedKey || '输入 API Key'; } revealed = false; field('reveal').textContent = '显示'; }
};
field('save').onclick = () => { void save().catch(() => {}); };
field('test').onclick = async () => {
  const button = field<HTMLButtonElement>('test'); button.disabled = true;
  field('connection').textContent = '正在测试…';
  try {
    await save(); const result = await window.settings.test();
    field('connection').textContent = result.ok ? `连接成功，可用模型：${result.models.join('、')}` : result.message;
  } catch { field('connection').textContent = '测试失败，请检查配置或文件权限。'; }
  finally { button.disabled = false; }
};
value('model').addEventListener('change', syncCustom);
for (const id of ['temperature', 'volume']) value(id).addEventListener('input', outputs);
window.settings.onConfig(next => {
  // Menu changes must survive a later settings save without overwriting edits in progress.
  if (!loaded) return;
  if (next.selfTalk.enabled !== config.selfTalk.enabled) value('self-talk').checked = next.selfTalk.enabled;
  config = { ...config, selfTalk: { ...config.selfTalk, enabled: next.selfTalk.enabled }, alwaysOnTop: next.alwaysOnTop, size: next.size, position: next.position, mousePassthrough: next.mousePassthrough };
});
window.settings.onSaveClose(() => { void save().then(() => window.settings.closeReady()).catch(() => {}); });
void window.settings.load().then(snapshot => {
  display(snapshot.config); maskedKey = snapshot.maskedKey; key.placeholder = maskedKey || '输入 API Key';
  warning.textContent = snapshot.needsReentry ? 'Key 无法解密，请重新填写。' : '';
  field('version').textContent = `版本 ${snapshot.version}`; loaded = true;
}).catch(() => { status.textContent = '设置加载失败，请检查文件权限。'; });
