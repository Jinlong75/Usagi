import { validChatRounds } from '../scripts/smoke-chat-report.mjs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The allowed smoke entry is JavaScript; its validation is tested directly.
import { BEHAVIORS, validBehaviorReport, validFocusedReport, validUiReport, validSoundReport, shouldRetryFreshElectron } from '../scripts/smoke.mjs';
import { runSmokeProcess } from '../scripts/smoke-process.mjs';

const success = { ok: true, ui: ['bubble', 'chat', 'settings'], model: '/repo/assets/models/usagi.vrm', earDifferenceRatio: 0.06, happyFaceDifferenceRatio: 0.1, opaqueRatio: 0.21, vrmVersion: '1', expressions: ['blink', 'happy'],
  behaviors: ['idle', 'walk', 'happy', 'surprised', 'shout', 'stretch', 'drag', 'ear-shake', 'jumpRope', 'blowBubbles', 'napPillow', 'eatRiceball', 'eatWatermelon', 'iceCream', 'sneakSnack'],
  behaviorOpaqueRatios: { idle: 0.21, walk: 0.2, happy: 0.23, surprised: 0.19, shout: 0.25, stretch: 0.24, drag: 0.2, 'ear-shake': 0.2, jumpRope: 0.22, blowBubbles: 0.22, napPillow: 0.22, eatRiceball: 0.22, eatWatermelon: 0.22, iceCream: 0.22, sneakSnack: 0.22 },
  propOpaqueRatios: { handles: 0.001, rope: 0.003, wand: 0.002, bubble: 0.002, pillow: 0.01, riceball: 0.002, watermelon: 0.002, iceCream: 0.002, cookie: 0.001 },
  propFraming: { jumpRope: true, blowBubbles: true, napPillow: true, eatRiceball: true, eatWatermelon: true, iceCream: true, sneakSnack: true },
  behaviorTopTransparent: { happy: true, shout: true, stretch: true } };

async function run(source: string, timeoutMs = 5_000) {
  let stdout = '';
  let stderr = '';
  const code = await runSmokeProcess(process.execPath, ['--input-type=module', '-e', source], {
    timeoutMs,
    stdout: (text) => { stdout += text; },
    stderr: (text) => { stderr += text; },
  });
  return { code, stdout, stderr };
}

describe('冒烟子进程结果与诊断（Node fixture，不启动 GUI）', () => {
  it('排空管道后读取分块 JSON，保留普通日志和 stderr', async () => {
    const json = JSON.stringify(success);
    const result = await run(`
      console.log('render started');
      console.error('diagnostic');
      process.stdout.write(${JSON.stringify(json.slice(0, 15))});
      setTimeout(() => process.stdout.write(${JSON.stringify(json.slice(15))}), 10);
    `);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('render started\n' + json + '\n');
    expect(result.stderr).toContain('diagnostic');
  });
  it('静默退出不能误报成功，并给出可读 JSON 原因', async () => {
    const result = await run('');
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, reason: 'Electron 已退出，但没有输出冒烟结果 JSON' });
  });
  it('错误报告即使退出 0 也判失败', async () => {
    const report = { ok: false, reason: '模型加载失败' };
    const result = await run(`console.log(${JSON.stringify(JSON.stringify(report))})`);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual(report);
  });
  it.each([
    { ok: true },
    { ...success, opaqueRatio: 1 },
    { ...success, opaqueRatio: 0 },
    { ...success, vrmVersion: '0' },
    { ...success, expressions: [1] },
  ])('不完整或无效的成功报告不能通过：%j', async (report) => {
    const result = await run(`console.log(${JSON.stringify(JSON.stringify(report))})`);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).ok).toBe(false);
    expect(JSON.parse(result.stdout).reason).toContain('检查值无效');
  });
  it('成功报告不能掩盖非零退出码', async () => {
    const result = await run(`console.log(${JSON.stringify(JSON.stringify(success))}); process.exitCode = 2;`);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).reason).toContain('进程退出：2');
  });
  it('信号终止保留诊断', async () => {
    const result = await run(`process.kill(process.pid, 'SIGTERM')`);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).reason).toContain('SIGTERM');
  });
  it('启动失败时仍输出失败 JSON', async () => {
    let output = '';
    const code = await runSmokeProcess('usagi-missing-electron-executable', [], {
      stdout: (text) => { output += text; },
    });
    expect(code).toBe(1);
    expect(JSON.parse(output).reason).toContain('Electron 启动失败');
  });
  it('超时时终止本次子进程并只输出一条失败结果', async () => {
    const result = await run('setInterval(() => {}, 1_000)', 100);
    expect(result.code).toBe(1);
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(result.stdout).reason).toContain('超过 60 秒');
  });
});

describe('十五种行为冒烟报告', () => {
  it('必须依序包含原有全部行为及甩耳朵，每张图的 alpha 占比有效', () => {
    expect(success.behaviors).toEqual(BEHAVIORS);
    expect(validBehaviorReport(success)).toBe(true);
    expect(validBehaviorReport({ ...success, behaviors: ['idle'] })).toBe(false);
    expect(validBehaviorReport({ ...success, behaviorOpaqueRatios: {} })).toBe(false);
    for (const ratio of [0, 0.019, 0.951, 1, NaN, Infinity]) {
      expect(validBehaviorReport({ ...success, behaviorOpaqueRatios: { ...success.behaviorOpaqueRatios, drag: ratio } })).toBe(false);
    }
    expect(validBehaviorReport({ ...success, behaviorOpaqueRatios: { ...success.behaviorOpaqueRatios, drag: 0.02 } })).toBe(true);
    expect(validBehaviorReport({ ...success, behaviorOpaqueRatios: { ...success.behaviorOpaqueRatios, drag: 0.95 } })).toBe(true);
  });
  it('喊叫、跳跃最高点和伸懒腰都必须证明顶部两行透明', () => {
    expect(validBehaviorReport({ ...success, behaviorTopTransparent: undefined })).toBe(false);
    for (const name of ['happy', 'shout', 'stretch']) {
      expect(validBehaviorReport({ ...success, behaviorTopTransparent: { ...success.behaviorTopTransparent, [name]: false } })).toBe(false);
      const partial = { ...success.behaviorTopTransparent };
      delete partial[name as keyof typeof partial];
      expect(validBehaviorReport({ ...success, behaviorTopTransparent: partial })).toBe(false);
    }
  });
});

 it('冒烟必须包含气泡、聊天、设置三种界面', () => {
   expect(validUiReport(success)).toBe(true);
   expect(validUiReport({ ...success, ui: ['bubble'] })).toBe(false);
   expect(validUiReport({ ...success, ui: undefined })).toBe(false);
 });

 it('音效成功报告要求实际资源目录、素材数量和解码成功', () => {
   const sounds = { directory: '/resources/sounds/usagi', clips: 20, decoded: true };
   expect(validSoundReport({ sounds })).toBe(true);
   for (const bad of [undefined, { ...sounds, clips: 0 }, { ...sounds, decoded: false }, { ...sounds, directory: '' }]) {
     expect(validSoundReport({ sounds: bad })).toBe(false);
   }
 });

it('冒烟必须证明 Usagi 资源、上 30% 耳朵变化 > 3% 与脸部表情变化', () => {
  for (const earDifferenceRatio of [undefined, 0, 0.03, NaN, Infinity, 1.1]) {
    expect(validBehaviorReport({ ...success, earDifferenceRatio })).toBe(false);
  }
  for (const happyFaceDifferenceRatio of [undefined, 0, NaN, Infinity, 1.1]) {
    expect(validBehaviorReport({ ...success, happyFaceDifferenceRatio })).toBe(false);
  }
  for (const model of ['Seed-san.vrm', '/assets/placeholder/Seed-san.vrm', 'usagi.vrm']) {
    expect(validBehaviorReport({ ...success, model })).toBe(false);
  }
  expect(validBehaviorReport({ ...success, model: '/bundle/resources/models/usagi.vrm' })).toBe(true);
});

describe('Electron UnknownVizError 只重跑一次', () => {
  it('原因正是 UnknownVizError 时重跑（首启或高负载），其他失败不重跑', () => {
    const viz = '{"ok":false,"reason":"Electron 冒烟进程退出：1；Error: UnknownVizError"}';
    expect(shouldRetryFreshElectron(true, 1, viz)).toBe(true);
    expect(shouldRetryFreshElectron(false, 1, viz)).toBe(true);
    expect(shouldRetryFreshElectron(true, 0, viz)).toBe(false);
    expect(shouldRetryFreshElectron(true, 1, '{"ok":false,"reason":"冒烟缺少界面"}')).toBe(false);
  });
});


it('新增道具每种必须有可见像素，七个活动道具必须全部在窗内', () => {
  for (const name of ['handles', 'rope', 'wand', 'bubble', 'pillow', 'riceball', 'watermelon', 'iceCream', 'cookie']) {
    for (const ratio of [undefined, 0, NaN, Infinity, 1.1]) {
      expect(validBehaviorReport({ ...success, propOpaqueRatios: { ...success.propOpaqueRatios, [name]: ratio } })).toBe(false);
    }
  }
  for (const name of ['jumpRope', 'blowBubbles', 'napPillow', 'eatRiceball', 'eatWatermelon', 'iceCream', 'sneakSnack']) {
    expect(validBehaviorReport({ ...success, propFraming: { ...success.propFraming, [name]: false } })).toBe(false);
  }
});

it('聚焦截图只接受点名道具行为，仍要求每类道具可见且完整入画，全量校验不接受聚焦结果', () => {
  const only = ['jumpRope', 'blowBubbles', 'napPillow', 'eatRiceball', 'eatWatermelon', 'iceCream', 'sneakSnack'];
  const report = { ...success, focused: true, behaviors: only };
  expect(validFocusedReport(report, only)).toBe(true);
  expect(validBehaviorReport(report)).toBe(false);
  expect(validFocusedReport(report, [])).toBe(false);
  expect(validFocusedReport(report, ['settings'])).toBe(false);
  expect(validFocusedReport({ ...report, focused: undefined }, only)).toBe(false);
  for (const name of only) expect(validFocusedReport({ ...report, propFraming: { ...report.propFraming, [name]: false } }, only)).toBe(false);
  for (const name of Object.keys(success.propOpaqueRatios)) {
    for (const ratio of [0, undefined, Infinity, NaN, 1.1]) {
      expect(validFocusedReport({ ...report, propOpaqueRatios: { ...report.propOpaqueRatios, [name]: ratio } }, only)).toBe(false);
    }
  }
});

function chatRounds() {
  return Array.from({ length: 12 }, (_, i) => ({ round: i + 1, windows: 3, renderGone: 0, childGone: 0,
    ipc: { 'chat:settings': 1 }, webContents: [1, 2, 3].map(id => ({ id, listeners: { 'render-process-gone': 1 } })),
    memory: { rss: 1000 + i, heapUsed: 500 + i } }));
}
it('12 轮聊天报告拒绝进程退出、窗口和监听器累积以及缺失采样', () => {
  expect(validChatRounds(chatRounds())).toBe(true);
  expect(validChatRounds(chatRounds().slice(0, 11))).toBe(false);
  for (const change of [
    { childGone: 1 }, { renderGone: 1 }, { windows: 4 }, { ipc: { 'chat:settings': 2 } },
    { webContents: [1, 2, 3].map(id => ({ id, listeners: { 'render-process-gone': 2 } })) },
    { memory: { rss: NaN, heapUsed: 1 } },
  ]) {
    const rounds = chatRounds(); Object.assign(rounds[11]!, change); expect(validChatRounds(rounds)).toBe(false);
  }
});
it('聚焦聊天报告也必须经子进程入口校验，不能静默省略 12 轮', async () => {
  const result = await run(`console.log(JSON.stringify({ ok: true, chatRoundsOnly: true, chatRounds: ${JSON.stringify(chatRounds())} }))`);
  expect(result.code).toBe(0);
  const missing = await run(`console.log(JSON.stringify({ ok: true, chatRoundsOnly: true }))`);
  expect(missing.code).toBe(1); expect(JSON.parse(missing.stdout).reason).toBe('12 轮聊天冒烟结果无效');
});

it('null采样及嵌套非对象结构返回false', () => {
  expect(validChatRounds(Array(12).fill(null))).toBe(false);
  expect(validChatRounds(Array(12))).toBe(false);
  for (const change of [null, [], 1, { ipc: [] }, { memory: null }, { webContents: [null, null, null] },
    { webContents: [1, 2, 3].map(id => ({ id, listeners: [] })) }]) {
    const rounds: unknown[] = chatRounds();
    rounds[0] = change === null || typeof change !== 'object' || Array.isArray(change)
      ? change : { ...chatRounds()[0], ...change };
    expect(validChatRounds(rounds)).toBe(false);
  }
});
it('完整冒烟入口校验异常必须非零退出', async () => {
  const loader = `export async function resolve(specifier, context, next) {
    if (specifier === './smoke-chat-report.mjs' && context.parentURL.endsWith('/smoke.mjs'))
      return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(
        'export function validChatRounds() { throw new Error("validator fixture"); }') };
    return next(specifier, context);
  }`;
  const result = await run(`
    import { register } from 'node:module';
    register('data:text/javascript,' + encodeURIComponent(${JSON.stringify(loader)}), import.meta.url);
    const { smokeMain } = await import(${JSON.stringify(new URL('../scripts/smoke.mjs', import.meta.url).href)});
    await smokeMain(process.execPath, ['--input-type=module', '-e',
      ${JSON.stringify('console.log(' + JSON.stringify(JSON.stringify({ ok: true, chatRoundsOnly: true, chatRounds: chatRounds() })) + ')')},
      '--', '--chat-rounds']);
  `);
  expect(result.code).toBe(1);
  expect(JSON.parse(result.stdout).ok).toBe(false);
  expect(result.stdout).toContain('冒烟校验异常：Error: validator fixture');
});
