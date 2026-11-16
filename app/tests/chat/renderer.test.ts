import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoutineChatBridge } from '../../src/shared/types';
import type { ChatEvent, ChatSnapshot } from '../../src/shared/ui';

// Exercise the real renderer with a small DOM substitute; no Electron or GUI.
class Element {
  value = ''; textContent = ''; className = ''; disabled = false;
  scrollTop = 0; scrollHeight = 100;
  children: Element[] = [];
  onclick?: () => void | Promise<void>;
  listeners = new Map<string, (event: any) => void>();
  append(...children: Element[]) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  addEventListener(name: string, callback: (event: any) => void) { this.listeners.set(name, callback); }
}
const fields = new Map<string, Element>();
const field = (id: string): Element => {
  if (!fields.has(id)) fields.set(id, new Element());
  return fields.get(id)!;
};
const question = '早上好～早饭吃了什么？';
const snapshot = (content = question): ChatSnapshot => ({
  session: { sessionId: 'current', createdAt: '2026-11-16T00:00:00.000Z', updatedAt: '2026-11-16T00:00:00.000Z',
    messages: [{ id: content, role: 'assistant', content, createdAt: '2026-11-16T00:00:00.000Z' }] },
  active: false, text: '',
});
let bridge: RoutineChatBridge;
let historyChanged: () => void;
let chatEvent: (event: ChatEvent) => void;
const submit = async () => {
  field('composer').listeners.get('submit')!({ preventDefault: vi.fn() });
  await vi.advanceTimersByTimeAsync(0);
};
const contents = () => field('messages').children.map(node => node.children[0]!.textContent);

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); fields.clear();
  bridge = {
    load: vi.fn(async () => snapshot()), send: vi.fn(async () => ({ requestId: 'answer' })),
    stop: vi.fn(async () => {}), clear: vi.fn(async () => true), settings: vi.fn(),
    onEvent: callback => { chatEvent = callback; return vi.fn(); },
    onHistoryChanged: callback => { historyChanged = callback; return vi.fn(); },
  };
  vi.stubGlobal('document', { querySelector: (selector: string) => field(selector.slice(1)), createElement: () => new Element() });
  vi.stubGlobal('window', { chat: bridge, addEventListener: vi.fn() });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('作息问题接入聊天页，无 GUI', () => {
  it('首次加载前禁止发送，记录就绪后显示 assistant 问题并允许直接回答', async () => {
    let resolve!: (value: ChatSnapshot) => void;
    vi.mocked(bridge.load).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await import('../../src/chat-window/index');
    field('input').value = '吃了面包';
    expect(field('send').disabled).toBe(true); await submit(); expect(bridge.send).not.toHaveBeenCalled();
    resolve(snapshot()); await vi.advanceTimersByTimeAsync(0);
    expect(contents()).toEqual([`🙂 ${question}`]); expect(field('send').disabled).toBe(false);
    await submit();
    expect(bridge.send).toHaveBeenCalledExactlyOnceWith('吃了面包');
    expect(contents()).toEqual([`🙂 ${question}`, '吃了面包']);
  });
  it('已有隐藏页面重读新增问话，保留输入草稿，加载期间不能提交旧上下文', async () => {
    await import('../../src/chat-window/index'); await vi.advanceTimersByTimeAsync(0);
    field('input').value = '想吃面条';
    let resolve!: (value: ChatSnapshot) => void;
    vi.mocked(bridge.load).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    historyChanged(); expect(field('send').disabled).toBe(true);
    await submit(); expect(bridge.send).not.toHaveBeenCalled();
    resolve(snapshot('午饭吃什么呀？')); await vi.advanceTimersByTimeAsync(0);
    expect(contents()).toEqual(['🙂 午饭吃什么呀？']); expect(field('input').value).toBe('想吃面条');
    expect(field('send').disabled).toBe(false); await submit();
    expect(bridge.send).toHaveBeenCalledExactlyOnceWith('想吃面条');
  });
  it('新增问话触发重读后，迟到的旧快照不能覆盖最新问题', async () => {
    let resolve!: (value: ChatSnapshot) => void;
    vi.mocked(bridge.load).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await import('../../src/chat-window/index');
    vi.mocked(bridge.load).mockResolvedValueOnce(snapshot('晚饭吃了没？'));
    historyChanged(); await vi.advanceTimersByTimeAsync(0);
    expect(contents()).toEqual(['🙂 晚饭吃了没？']);
    resolve(snapshot()); await vi.advanceTimersByTimeAsync(0);
    expect(contents()).toEqual(['🙂 晚饭吃了没？']); expect(field('send').disabled).toBe(false);
  });
  it('未填 Key 时保留问题并沿用去设置入口；重读失败显示原有存储错误提示', async () => {
    await import('../../src/chat-window/index'); await vi.advanceTimersByTimeAsync(0);
    field('input').value = '面包'; await submit();
    chatEvent({ type: 'error', requestId: 'answer', code: 'no_key', message: '请先填写 API Key' });
    const error = field('messages').children.at(-1)!.children[0]!;
    expect(error.textContent).toBe('请先填写 API Key');
    const settings = error.children.at(-1)!; expect(settings.textContent).toBe('去设置');
    await settings.onclick!(); expect(bridge.settings).toHaveBeenCalledOnce();
    expect(contents()[0]).toBe(`🙂 ${question}`);
    vi.mocked(bridge.load).mockRejectedValueOnce(new Error('EACCES'));
    historyChanged(); await vi.advanceTimersByTimeAsync(0);
    expect(contents().at(-1)).toBe('聊天记录加载失败，请检查文件权限。');
    expect(field('send').disabled).toBe(true);
  });
});
