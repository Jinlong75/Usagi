import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { withSmokeDeadline } from './smoke-timeout.mjs';

if (!process.argv[2]) throw new Error('用法：npm run smoke:packaged -- /路径/Usagi.app/Contents/MacOS/Usagi');
process.exitCode = await withSmokeDeadline([
  fileURLToPath(new URL('./packaged-smoke-entry.mjs', import.meta.url)), resolve(process.argv[2]),
]);
