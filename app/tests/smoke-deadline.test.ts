import { expect, it } from 'vitest';
// @ts-expect-error 外层超时入口为 JavaScript，Node fixture 不启动 GUI。
import { withSmokeDeadline } from '../scripts/smoke-timeout.mjs';

it('整个冒烟包括同步首次下载在外层超时内终止，返回 1', async () => {
  const start = Date.now();
  const code = await withSmokeDeadline(['--input-type=module', '-e', `
    import { spawnSync } from 'node:child_process';
    spawnSync(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio:'inherit'});
  `], { timeoutMs: 200 });
  expect(code).toBe(1);
  expect(Date.now() - start).toBeLessThan(3000);
});
