import { describe, expect, it } from 'vitest';
// @ts-expect-error The allowed smoke entry is JavaScript; its validation is tested directly.
import { BEHAVIORS, validBehaviorReport } from '../scripts/smoke.mjs';
import { runSmokeProcess } from '../scripts/smoke-process.mjs';

const success = { ok: true, model: 'Seed-san.vrm', opaqueRatio: 0.21, vrmVersion: '1', expressions: ['blink', 'happy'],
  behaviors: ['idle', 'walk', 'happy', 'surprised', 'shout', 'drag'],
  behaviorOpaqueRatios: { idle: 0.21, walk: 0.2, happy: 0.23, surprised: 0.19, shout: 0.25, drag: 0.2 },
  behaviorTopTransparent: { happy: true, shout: true } };

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

describe('六种行为冒烟报告', () => {
  it('必须依序包含六种行为且每张图的 alpha 占比有效', () => {
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
  it('喊叫和跳跃最高点都必须证明顶部两行透明', () => {
    expect(validBehaviorReport({ ...success, behaviorTopTransparent: undefined })).toBe(false);
    for (const name of ['happy', 'shout']) {
      expect(validBehaviorReport({ ...success, behaviorTopTransparent: { ...success.behaviorTopTransparent, [name]: false } })).toBe(false);
    }
  });
});
