import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../src/main/config';
import type { SettingsBridge } from '../src/shared/ui';

// Only the DOM fields used by settings are needed; no Electron or GUI is started.
class Field {
  value = ''; textContent = ''; placeholder = ''; type = ''; checked = false; hidden = false; disabled = false;
  closest() { return { insertAdjacentHTML: vi.fn() }; }
  onclick?: () => void | Promise<void>;
  listeners = new Map<string, () => void>();
  classes = new Set<string>();
  classList = { add: (name: string) => this.classes.add(name), remove: (name: string) => this.classes.delete(name) };
  addEventListener(name: string, callback: () => void) { this.listeners.set(name, callback); }
  input(value: string) { this.value = value; this.listeners.get('input')?.(); }
}
const fields = new Map<string, Field>();
function field(id: string): Field {
  if (!fields.has(id)) fields.set(id, new Field());
  return fields.get(id)!;
}
let close = () => {};
let bridge: SettingsBridge;

describe('设置页保存失败，无 GUI', () => {
  beforeEach(async () => {
    vi.resetModules(); fields.clear();
    bridge = {
      load: vi.fn(async () => ({ config: structuredClone(DEFAULT_CONFIG), maskedKey: 'sk-****abcd', needsReentry: false, version: '0.1.0' })),
      save: vi.fn(async () => ({ ok: false as const, reason: 'EACCES: permission denied' })),
      revealKey: vi.fn(async () => ''), test: vi.fn(async () => ({ ok: true as const, models: [] })),
      onConfig: vi.fn(() => () => {}), onSaveClose: callback => { close = callback; return () => {}; }, closeReady: vi.fn(),
    };
    vi.stubGlobal('window', { settings: bridge });
    vi.stubGlobal('document', { getElementById: field });
    await import('../src/settings/index');
    await vi.waitFor(() => expect(field('version').textContent).toBe('版本 0.1.0'));
    field('model').value = 'custom'; field('custom-model').value = 'my-model';
    field('lines').value = '保留我的台词'; field('volume').value = '0.2'; field('key').input('edited-key');
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each(['保存按钮', '关闭窗口', '测试连接'])('%s 收到失败后显示红字，保留编辑和 Key，不关闭；成功重试清除错误', async trigger => {
    if (trigger === '关闭窗口') close();
    else await field(trigger === '测试连接' ? 'test' : 'save').onclick!();
    await vi.waitFor(() => expect(field('save-status').textContent)
      .toBe('设置保存失败：EACCES: permission denied。请检查磁盘空间和文件权限。'));
    expect(field('save-status').classes.has('error')).toBe(true);
    expect(field('custom-model').value).toBe('my-model'); expect(field('lines').value).toBe('保留我的台词');
    expect(field('volume').value).toBe('0.2'); expect(field('key').value).toBe('edited-key');
    expect(bridge.closeReady).not.toHaveBeenCalled(); expect(bridge.test).not.toHaveBeenCalled();
    expect(bridge.save).toHaveBeenCalledWith(expect.objectContaining({
      chat: expect.objectContaining({ model: 'my-model' }), volume: 0.2,
      selfTalk: expect.objectContaining({ lines: ['保留我的台词'] }),
    }), 'edited-key');

    vi.mocked(bridge.save).mockImplementationOnce(async config => ({ ok: true, config, maskedKey: 'sk-****dkey' }));
    close();
    await vi.waitFor(() => expect(bridge.closeReady).toHaveBeenCalledTimes(1));
    expect(bridge.save).toHaveBeenCalledTimes(2);
    expect(vi.mocked(bridge.save).mock.calls[1]).toEqual(vi.mocked(bridge.save).mock.calls[0]);
    expect(field('save-status').textContent).toBe('已保存，立即生效');
    expect(field('save-status').classes.has('error')).toBe(false);
    expect(field('key').value).toBe('');
  });

  it('显示默认作息并保存所有时间，菜单免打扰同步时保留正在编辑的时间', async () => {
    expect(field('routine-enabled').checked).toBe(true); expect(field('routine-quiet').checked).toBe(false);
    expect(field('routine-morning-start').value).toBe('06:00'); expect(field('routine-sleep-end').value).toBe('06:00');
    field('routine-morning-start').value = '07:30'; field('routine-bedtime').value = '23:00';
    field('routine-enabled').checked = false;
    const onConfig = vi.mocked(bridge.onConfig).mock.calls[0]![0];
    onConfig({ ...structuredClone(DEFAULT_CONFIG), routine: { ...structuredClone(DEFAULT_CONFIG.routine), quiet: true } });
    expect(field('routine-quiet').checked).toBe(true); expect(field('routine-morning-start').value).toBe('07:30');
    await field('save').onclick!();
    await vi.waitFor(() => expect(bridge.save).toHaveBeenCalled());
    expect(vi.mocked(bridge.save).mock.calls[0]![0].routine).toEqual({ ...DEFAULT_CONFIG.routine,
      enabled: false, quiet: true, morning: ['07:30', '10:00'], bedtime: '23:00' });
  });

  it('IPC 抛错也显示具体原因并保留窗口', async () => {
    vi.mocked(bridge.save).mockRejectedValueOnce(new Error('disk full'));
    close();
    await vi.waitFor(() => expect(field('save-status').textContent)
      .toBe('设置保存失败：disk full。请检查磁盘空间和文件权限。'));
    expect(field('save-status').classes.has('error')).toBe(true);
    expect(field('key').value).toBe('edited-key'); expect(bridge.closeReady).not.toHaveBeenCalled();
  });

  it('占位安装包关于页明确标记开发版', async () => {
    vi.resetModules(); vi.stubGlobal('__USAGI_PLACEHOLDER__', true);
    await import('../src/settings/index');
    await vi.waitFor(() => expect(field('version').textContent).toBe('版本 0.1.0 · 开发版（占位模型）'));
  });
});
