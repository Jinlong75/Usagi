import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runSmokeProcess } from './smoke-process.mjs';

export const BEHAVIORS = ['idle', 'walk', 'happy', 'surprised', 'shout', 'stretch', 'drag', 'ear-shake', 'jumpRope', 'blowBubbles', 'napPillow', 'eatRiceball', 'eatWatermelon', 'iceCream', 'sneakSnack', 'sit'];
export function validFocusedReport(report, only) {
  const props = { sit: [], jumpRope: ['handles', 'rope'], blowBubbles: ['wand', 'bubble'], napPillow: ['pillow'], eatRiceball: ['riceball'], eatWatermelon: ['watermelon'], iceCream: ['iceCream'], sneakSnack: ['cookie'] };
  const expected = BEHAVIORS.filter(name => only.includes(name));
  return only.length > 0 && only.every(name => Object.hasOwn(props, name)) && report.focused === true &&
    report.vrmVersion === '1' && JSON.stringify(report.behaviors) === JSON.stringify(expected) &&
    expected.every(name => report.behaviorOpaqueRatios?.[name] >= 0.02 && report.behaviorOpaqueRatios[name] <= 0.95 &&
      (name === 'sit' || report.propFraming?.[name] === true) && props[name].every(prop => Number.isFinite(report.propOpaqueRatios?.[prop]) &&
        report.propOpaqueRatios[prop] > 0 && report.propOpaqueRatios[prop] <= 1));
}
export function validUiReport(report) { return JSON.stringify(report.ui) === JSON.stringify(['bubble', 'chat', 'settings']); }
export function validSoundReport(report) {
  return typeof report.sounds?.directory === 'string' && !!report.sounds.directory &&
    Number.isInteger(report.sounds.clips) && report.sounds.clips > 0 && report.sounds.decoded === true;
}
export function validBehaviorReport(report) {
  return typeof report.model === 'string' && /(?:assets[\\/]models|(?:^|[\\/])models)[\\/]usagi\.vrm$/.test(report.model) &&
    Number.isFinite(report.earDifferenceRatio) && report.earDifferenceRatio > 0.03 && report.earDifferenceRatio <= 1 &&
    Number.isFinite(report.happyFaceDifferenceRatio) && report.happyFaceDifferenceRatio > 0 && report.happyFaceDifferenceRatio <= 1 &&
    Array.isArray(report.behaviors) && JSON.stringify(report.behaviors) === JSON.stringify(BEHAVIORS) &&
    BEHAVIORS.every((name) => Number.isFinite(report.behaviorOpaqueRatios?.[name]) &&
      report.behaviorOpaqueRatios[name] >= 0.02 && report.behaviorOpaqueRatios[name] <= 0.95) &&
    ['handles', 'rope', 'wand', 'bubble', 'pillow', 'riceball', 'watermelon', 'iceCream', 'cookie'].every(name => Number.isFinite(report.propOpaqueRatios?.[name]) && report.propOpaqueRatios[name] > 0 && report.propOpaqueRatios[name] <= 1) &&
    ['jumpRope', 'blowBubbles', 'napPillow', 'eatRiceball', 'eatWatermelon', 'iceCream', 'sneakSnack'].every(name => report.propFraming?.[name] === true) &&
    ['happy', 'shout', 'stretch'].every((name) => report.behaviorTopTransparent?.[name] === true);
}

/** 刚解压的 Electron 在 macOS 上首次启动时 GPU 进程起不来，报 UnknownVizError，第二次即正常
 * （主导 2026-11-16 复现：删掉 node_modules/electron/dist 后首跑必失败、次跑通过）。
 * 机器高负载（平均负载约 30）时非首启也会在截图后出现同一错误（主导 2026-11-16 21:10 复现）。
 * 只要原因正是 UnknownVizError 就重跑一次；其他失败照常报出。freshDownload 只用于提示文字。 */
export function shouldRetryFreshElectron(_freshDownload, code, output) {
  return code !== 0 && /UnknownVizError/.test(output);
}

async function runOnce(electron, args) {
  let invalid = false; let output = '';
  const only = args.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
  const code = await runSmokeProcess(electron, args, {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdout: (text) => {
      output += text;
      try {
        const report = JSON.parse(text);
        if (report.ok && (only ? !validFocusedReport(report, only) : !validBehaviorReport(report) || !validUiReport(report) || !validSoundReport(report))) {
          invalid = true;
          process.stdout.write(JSON.stringify({ ...report, ok: false, reason: '冒烟缺少界面/行为/音效、不透明像素占比无效或角色超出取景' }) + '\n');
          return;
        }
      } catch { /* Ordinary child diagnostics are forwarded unchanged. */ }
      process.stdout.write(text);
    },
  });
  return { code: invalid ? 1 : code, output };
}

export async function smokeMain(executable, args = ['.', '--smoke', ...process.argv.slice(2)]) {
  try {
    const freshDownload = !executable && !existsSync(fileURLToPath(new URL('../node_modules/electron/dist', import.meta.url)));
    const electron = executable ?? (await import('electron')).default;
    let result = await runOnce(electron, args);
    if (shouldRetryFreshElectron(freshDownload, result.code, result.output)) {
      console.log(freshDownload ? '刚下载的 Electron 首次启动报 UnknownVizError（macOS 首启问题），重跑一次冒烟' : 'Electron GPU 进程报 UnknownVizError（高负载偶发），重跑一次冒烟');
      result = await runOnce(electron, args);
    }
    process.exitCode = result.code;
  } catch (error) {
    console.log(JSON.stringify({ ok: false, reason: `Electron 冒烟启动失败：${error.message}` }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await smokeMain();
