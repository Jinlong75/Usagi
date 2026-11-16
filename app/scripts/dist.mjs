import { build, Platform, Arch } from 'electron-builder';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { digest, packageModel } from './package-model.mjs';

const directory = fileURLToPath(new URL('..', import.meta.url));
const root = resolve(directory, '..');
process.chdir(directory);
const target = process.argv[2];
if (!['mac', 'win', 'all'].includes(target)) throw new Error('用法：node scripts/dist.mjs mac|win|all');
const model = packageModel(root);
console.log(model.development ? '开发版（占位模型）：产物仅供本机自测，不可分发。' : '使用正式 Usagi 模型；仅供个人使用。');
await new Promise((done, reject) => {
  const child = spawn(process.execPath, ['scripts/build.mjs'], {
    stdio: 'inherit', env: { ...process.env, USAGI_PLACEHOLDER_BUILD: model.development ? '1' : '0' },
  });
  child.on('error', reject);
  child.on('close', code => code === 0 ? done() : reject(new Error(`构建失败：${code}`)));
});

// 不让占位素材进入正式包；同时核对打包后实际资源，遗漏即停止生成安装包。
async function verifyResources(context) {
  const resources = context.electronPlatformName === 'darwin' ?
    join(context.appOutDir, 'Usagi.app/Contents/Resources') : join(context.appOutDir, 'resources');
  if (digest(await readFile(join(resources, 'models/usagi.vrm'))) !== model.hash) throw new Error('包内模型与选定源文件不同');
  const names = await readdir(join(resources, 'models'));
  if (names.some(name => /seed/i.test(name))) throw new Error('包内包含 Seed-san 文件名');
  const sourceSounds = join(root, 'assets/sounds/usagi');
  for (const name of (await readdir(sourceSounds)).filter(name => name === 'manifest.json' || name.endsWith('.ogg'))) {
    if (digest(await readFile(join(resources, 'sounds/usagi', name))) !== digest(await readFile(join(sourceSounds, name)))) {
      throw new Error(`包内音效不同或缺失：${name}`);
    }
  }
  if (!model.development && (await readFile(join(resources, 'models/usagi.vrm'))).includes(Buffer.from('Seed-san'))) {
    throw new Error('正式包含 Seed-san 素材');
  }
}

for (const platform of target === 'all' ? ['mac', 'win'] : [target]) {
  const targets = platform === 'mac' ? Platform.MAC.createTarget('dmg', Arch.arm64) : Platform.WINDOWS.createTarget('nsis', Arch.x64);
  await build({ targets, publish: 'never', config: {
    artifactName: `Usagi-\${version}-\${os}-\${arch}${model.development ? '-dev' : ''}.\${ext}`,
    electronDownload: { mirror: process.env.ELECTRON_MIRROR || process.env.npm_config_electron_mirror || 'https://npmmirror.com/mirrors/electron/' },
    beforePack(context) {
      // FileSet 在继承合并时会追加；在打包前整体替换，确保只带选定的一个模型。
      context.packager.config.extraResources = [
        { from: model.source, to: 'models/usagi.vrm' },
        { from: resolve(root, 'assets/sounds/usagi'), to: 'sounds/usagi', filter: ['*.ogg', 'manifest.json'] },
      ];
    },
    afterPack: verifyResources,
  } });
}
// TODO(lead): Windows 实机安装验证（单击安装、启动、快捷方式、卸载后保留用户数据）。
