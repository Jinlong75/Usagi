// 014 聚焦入口：只验证合成/正式产物的色块边界，不渲染、不覆盖正式产物。
// 执行者启动前按项目规则运行 ar gui check Blender --headless。
import { spawnSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDir = dirname(fileURLToPath(import.meta.url));
const blender = process.env.BLENDER || join(userInfo().homedir, 'Applications/Blender.app/Contents/MacOS/Blender');
const expression = [
  'import sys',
  'sys.dont_write_bytecode = True',
  `sys.path.insert(0, ${JSON.stringify(testsDir)})`,
  'from test_prep_usagi import run_tests',
  "run_tests(['test_08_synthetic_cut_ellipse_closed_and_smooth', 'test_09_real_product_boundaries'])",
].join('\n');
const result = spawnSync(blender, [
  '-b', '--factory-startup', '--python-exit-code', '1', '--python-expr', expression,
], { cwd: resolve(testsDir, '../..'), stdio: 'inherit' });
if (result.error) console.error(result.error.message);
if (result.signal) console.error(`Blender terminated by ${result.signal}`);
process.exitCode = result.status ?? 1;
