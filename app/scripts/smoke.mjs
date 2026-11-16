import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runSmokeProcess } from './smoke-process.mjs';

export const BEHAVIORS = ['idle', 'walk', 'happy', 'surprised', 'shout', 'drag'];
export function validBehaviorReport(report) {
  return Array.isArray(report.behaviors) && JSON.stringify(report.behaviors) === JSON.stringify(BEHAVIORS) &&
    BEHAVIORS.every((name) => Number.isFinite(report.behaviorOpaqueRatios?.[name]) &&
      report.behaviorOpaqueRatios[name] >= 0.02 && report.behaviorOpaqueRatios[name] <= 0.95);
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
          if (report.ok && !validBehaviorReport(report)) {
            invalid = true;
            process.stdout.write(JSON.stringify({ ...report, ok: false, reason: '冒烟缺少六种行为或不透明像素占比无效' }) + '\n');
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
