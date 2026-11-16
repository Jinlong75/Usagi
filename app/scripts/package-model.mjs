import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function packageModel(root) {
  const official = resolve(root, 'assets/models/usagi.vrm');
  const placeholder = resolve(root, 'assets/placeholder/Seed-san.vrm');
  const development = !existsSync(official);
  const source = development ? placeholder : official;
  const bytes = readFileSync(source);
  if (!development && (bytes.includes(Buffer.from('Seed-san')) ||
    (existsSync(placeholder) && digest(bytes) === digest(readFileSync(placeholder))))) {
    throw new Error('拒绝正式打包：Usagi 模型仍是 Seed-san 占位素材');
  }
  return { source, development, hash: digest(bytes) };
}
