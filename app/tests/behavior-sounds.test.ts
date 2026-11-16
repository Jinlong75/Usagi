import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SoundLibrary, soundClips } from '../src/main/sounds';
import { PetAudio } from '../src/renderer/behavior/audio';

const directories: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
describe('受限音效读取', () => {
  it('只暴露非空文件、clean/bgm、合法 uses；拒绝越界路径', () => {
    const clip = { file: 'a.ogg', quality: 'clean', uses: ['click_happy'] };
    expect(soundClips({ clips: [clip, { ...clip, quality: 'bgm' }, ...['mixed', 'noisy'].map((quality) => ({ ...clip, quality })),
      ...[null, '', '../outside.ogg', '/outside.ogg', 'a\\b.ogg'].map((file) => ({ ...clip, file })), { ...clip, uses: [1] }] }))
      .toEqual([clip, { ...clip, quality: 'bgm' }]);
    expect(soundClips(null)).toEqual([]);
  });
  it('即使 manifest 使用普通相对文件名，也不能通过符号链接读取目录外内容', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'usagi-sound-')); directories.push(dir);
    const inside = join(dir, 'inside'); await mkdir(inside);
    await writeFile(join(dir, 'outside.ogg'), new Uint8Array([9]));
    await symlink(join(dir, 'outside.ogg'), join(inside, 'a.ogg'));
    await writeFile(join(inside, 'manifest.json'), JSON.stringify({ clips: [{ file: 'a.ogg', quality: 'clean', uses: ['drag'] }] }));
    const log = vi.fn(); const library = new SoundLibrary(inside, () => 0, log);
    expect(await library.load('drag')).toBeNull(); expect(await library.load('drag')).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
  });
  it('素材按 uses 读取字节；缺类别/manifest 只记一次日志', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'usagi-sound-')); directories.push(dir);
    await writeFile(join(dir, 'a.ogg'), new Uint8Array([1, 2, 3]));
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ clips: [{ file: 'a.ogg', quality: 'bgm', uses: ['click_happy'] }] }));
    const log = vi.fn(); const library = new SoundLibrary(dir, () => 0, log);
    expect(await library.load('click_happy')).toEqual(new Uint8Array([1, 2, 3]));
    expect(await library.load('drag')).toBeNull(); expect(await library.load('drag')).toBeNull(); expect(log).toHaveBeenCalledTimes(1);
    const missing = join(dir, 'missing'); await mkdir(missing);
    const absentLog = vi.fn(); const absent = new SoundLibrary(missing, () => 0, absentLog);
    expect(await absent.load('click_happy')).toBeNull(); expect(await absent.load('click_happy')).toBeNull();
    expect(await absent.load('drag')).toBeNull();
    expect(absentLog).toHaveBeenCalledTimes(1);
    expect(absentLog.mock.calls[0]![0]).toContain('manifest');
  });
});
describe('Web Audio 单通道', () => {
  it('音量 0.7，新音打断旧音，等待中的读盘结果不能复活', async () => {
    const sources: { stop: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended?: () => void }[] = [];
    const gains: { gain: { value: number }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal('AudioContext', class {
      destination = {};
      resume = async () => {};
      decodeAudioData = async () => ({});
      createBufferSource() { const source = { stop: vi.fn(), start: vi.fn(), connect: vi.fn(), disconnect: vi.fn() }; sources.push(source); return source; }
      createGain() { const gain = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }; gains.push(gain); return gain; }
    });
    let resolvePending: (bytes: ArrayBuffer) => void = () => {};
    let markLoadStarted: () => void = () => {};
    const loadStarted = new Promise<void>((resolve) => { markLoadStarted = resolve; });
    const audio = new PetAudio(async (use) => use === 'drag' ? new Promise<ArrayBuffer>((resolve) => {
      resolvePending = resolve; markLoadStarted();
    }) : new Uint8Array([1]).buffer);
    await audio.play('click_happy'); expect(sources[0]!.start).toHaveBeenCalledTimes(1); expect(gains[0]!.gain.value).toBe(0.7);
    await audio.play('click_shout'); expect(sources[0]!.stop).toHaveBeenCalledTimes(1);
    const pending = audio.play('drag'); await loadStarted; audio.stop();
    resolvePending(new Uint8Array([2]).buffer); await pending;
    expect(sources).toHaveLength(2); expect(sources[1]!.stop).toHaveBeenCalledTimes(1);
  });
});
