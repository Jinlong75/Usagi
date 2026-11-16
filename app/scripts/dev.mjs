import { spawn } from 'node:child_process';
import electron from 'electron';
import { createServer } from 'vite';
import { buildProcesses } from './build.mjs';

await buildProcesses();
const server = await createServer({ server: { host: '127.0.0.1' } });
await server.listen();
const child = spawn(electron, ['.'], {
  stdio: 'inherit', env: { ...process.env, USAGI_DEV_URL: server.resolvedUrls.local[0] },
});
child.on('error', async (error) => { console.error(error); await server.close(); process.exitCode = 1; });
child.on('exit', async (code) => { await server.close(); process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
