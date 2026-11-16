import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { SoundUse } from '../shared/types';
import { resolveSounds, type ResourceRuntime } from './paths';

export interface SoundClip { file: string; quality: 'clean' | 'bgm'; uses: string[] }
export function soundClips(manifest: unknown): SoundClip[] {
  if (!manifest || typeof manifest !== 'object' || !('clips' in manifest) || !Array.isArray(manifest.clips)) return [];
  return manifest.clips.filter((clip): clip is SoundClip => clip && typeof clip.file === 'string' && clip.file.trim() &&
    !isAbsolute(clip.file) && !clip.file.includes('\\') && !clip.file.split('/').includes('..') &&
    (clip.quality === 'clean' || clip.quality === 'bgm') && Array.isArray(clip.uses) && clip.uses.every((use: unknown) => typeof use === 'string'));
}
export class SoundLibrary {
  private clips?: Promise<SoundClip[] | null>;
  private logged = new Set<string>();
  constructor(private directory: string, private random = Math.random, private log = console.warn) {}
  static fromRuntime(root: string, runtime: ResourceRuntime): SoundLibrary {
    return new SoundLibrary(resolveSounds(root, runtime));
  }
  async verify(): Promise<{ directory: string; clips: number; sample: Uint8Array }> {
    const clips = soundClips(JSON.parse(await readFile(resolve(this.directory, 'manifest.json'), 'utf8')));
    if (!clips.length) throw new Error('音效 manifest 没有可用素材');
    let sample: Uint8Array | undefined;
    for (const clip of clips) {
      const bytes = await this.readClip(clip);
      if (Buffer.from(bytes.subarray(0, 4)).toString() !== 'OggS') throw new Error(`音效不是 Ogg：${clip.file}`);
      sample ??= bytes;
    }
    return { directory: this.directory, clips: clips.length, sample: sample! };
  }
  private async readClip(clip: SoundClip): Promise<Uint8Array> {
    const directory = await realpath(this.directory);
    const path = await realpath(resolve(directory, clip.file));
    const child = relative(directory, path);
    if (child.startsWith('..') || isAbsolute(child)) throw new Error('音效越界');
    return new Uint8Array(await readFile(path));
  }
  private once(key: string): void {
    if (!this.logged.has(key)) { this.logged.add(key); this.log(`叫声静默跳过：${key}`); }
  }
  async load(use: SoundUse): Promise<Uint8Array | null> {
    this.clips ??= readFile(resolve(this.directory, 'manifest.json'), 'utf8')
      .then((text) => soundClips(JSON.parse(text) as unknown)).catch(() => { this.once('manifest 不存在或无效'); return null; });
    const clips = await this.clips;
    if (!clips) return null;
    const choices = clips.filter((clip) => clip.uses.includes(use));
    if (!choices.length) { this.once(use); return null; }
    const clip = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))]!;
    try {
      return await this.readClip(clip);
    } catch { this.once(clip.file); return null; }
  }
}
