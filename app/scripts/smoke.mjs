import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runSmokeProcess } from './smoke-process.mjs';

export const BEHAVIORS = ['idle', 'walk', 'happy', 'surprised', 'shout', 'stretch', 'drag'];
export function validUiReport(report) { return JSON.stringify(report.ui) === JSON.stringify(['bubble', 'chat', 'settings']); }
export function validBehaviorReport(report) {
  return Array.isArray(report.behaviors) && JSON.stringify(report.behaviors) === JSON.stringify(BEHAVIORS) &&
    BEHAVIORS.every((name) => Number.isFinite(report.behaviorOpaqueRatios?.[name]) &&
      report.behaviorOpaqueRatios[name] >= 0.02 && report.behaviorOpaqueRatios[name] <= 0.95) &&
    ['happy', 'shout', 'stretch'].every((name) => report.behaviorTopTransparent?.[name] === true);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { default: electron } = await import('electron');
    let invalid = false;
    const code = await runSmokeProcess(electron, ['.', '--smoke'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      stdout: (text) => {
        try {
          const report = JSON.parse(text);
          if (report.ok && (!validBehaviorReport(report) || !validUiReport(report))) {
            invalid = true;
            process.stdout.write(JSON.stringify({ ...report, ok: false, reason: '冒烟缺少界面/行为、不透明像素占比无效或角色超出取景' }) + '\n');
            return;
          }
        } catch { /* Ordinary child diagnostics are forwarded unchanged. */ }
        process.stdout.write(text);
      },
    });
    process.exitCode = invalid ? 1 : code;
  } catch (error) {
    console.log(JSON.stringify({ ok: false, reason: `Electron 冒烟启动失败：${error.message}` }));
    process.exitCode = 1;
  }
}
