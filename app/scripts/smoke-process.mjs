import { spawn } from 'node:child_process';

/** Monitor only the child created for this smoke run, including failures before app startup. */
export function runSmokeProcess(executable, args, options = {}) {
  const stdout = options.stdout ?? ((text) => process.stdout.write(text));
  const stderr = options.stderr ?? ((text) => process.stderr.write(text));
  return new Promise((resolve) => {
    let finished = false;
    let pending = '';
    let report;
    const finish = (code, reason) => {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      stdout(JSON.stringify(reason ? { ok: false, reason } : report) + '\n');
      resolve(code);
    };
    const consumeLine = (line) => {
      try {
        const value = JSON.parse(line);
        if (typeof value?.ok === 'boolean') { report = value; return; }
      } catch { /* Electron may also write ordinary diagnostics to stdout. */ }
      if (line) stdout(line + '\n');
    };
    const child = spawn(executable, args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const watchdog = setTimeout(() => {
      child.kill('SIGKILL');
      finish(1, 'Electron 冒烟进程超过 60 秒');
    }, options.timeoutMs ?? 60_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      pending += chunk;
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) {
        consumeLine(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
    });
    child.stderr.on('data', (chunk) => stderr(chunk));
    child.on('error', (error) => finish(1, `Electron 启动失败：${error.message}`));
    // close, unlike exit, waits until the child's stdout/stderr have been drained.
    child.on('close', (code, signal) => {
      if (finished) return;
      if (pending) consumeLine(pending);
      if (signal || code !== 0) return finish(1,
        `Electron 冒烟进程退出：${signal ?? code}${report?.reason ? `；${report.reason}` : ''}`);
      if (!report) return finish(1, 'Electron 已退出，但没有输出冒烟结果 JSON');
      if (report.ok && (typeof report.model !== 'string' || !report.model ||
          !Number.isFinite(report.opaqueRatio) || report.opaqueRatio < 0.02 || report.opaqueRatio > 0.95 ||
          report.vrmVersion !== '1' || !Array.isArray(report.expressions) ||
          !report.expressions.every((expression) => typeof expression === 'string'))) {
        return finish(1, 'Electron 冒烟结果 JSON 缺少字段或检查值无效');
      }
      finish(report.ok ? 0 : 1);
    });
  });
}
