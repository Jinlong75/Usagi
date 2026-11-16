import { createRequire } from 'node:module';
import type { Rect } from '../../shared/types';
import { coversDisplay } from './logic';
import type { WindowInfo } from './logic';

type Koffi = typeof import('koffi');
export interface NativeWindows { list(): WindowInfo[]; foreground(windows: WindowInfo[]): WindowInfo | undefined }
/** Load at runtime: keep the native module outside the esbuild bundle. */
const runtimeRequire = createRequire(typeof __filename === 'string' ? __filename : `${process.cwd()}/package.json`);
export function createWindowReader(options: {
  platform?: string; pid?: number; load?: () => Koffi; log?: (reason: string) => void; toDip?: (rect: Rect) => Rect;
} = {}) {
  let native: NativeWindows | undefined, failed = false;
  const fail = (error: unknown) => {
    if (!failed) (options.log ?? console.warn)(`窗口吸附与全屏检测已关闭：${String(error).replace(/\s+/g, ' ')}`);
    failed = true; native = undefined;
  };
  return {
    list(): WindowInfo[] {
      if (failed) return [];
      try {
        const platform = options.platform ?? process.platform;
        if (!native) {
          const k = (options.load ?? (() => runtimeRequire('koffi') as Koffi))();
          native = platform === 'win32' ? windowsApi(k, options.toDip ?? (r => r)) : platform === 'darwin' ? macApi(k) : undefined;
          if (!native) throw new Error(`unsupported platform ${platform}`);
        }
        return native.list().filter(w => w.ownerPid !== (options.pid ?? process.pid));
      } catch (error) { fail(error); return []; }
    },
    fullscreen(windows: WindowInfo[], display: (bounds: Rect) => Rect): boolean {
      if (failed || !native) return false;
      try { const w = native.foreground(windows); return !!w && coversDisplay(w, display(w.bounds)); }
      catch (error) { fail(error); return false; }
    },
    get available() { return !failed; },
  };
}
function windowsApi(k: Koffi, toDip: (r: Rect) => Rect): NativeWindows {
  const user = k.load('user32.dll'), dwm = k.load('dwmapi.dll');
  const RECT = k.struct({ left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
  const callback = k.proto('__stdcall', 'bool', ['void *', 'intptr_t']);
  const enumerate = user.func('__stdcall', 'EnumWindows', 'bool', [k.pointer(callback), 'intptr_t']);
  const visible = user.func('bool __stdcall IsWindowVisible(void *hwnd)');
  const iconic = user.func('bool __stdcall IsIconic(void *hwnd)');
  const pid = user.func('uint32 __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ uint32 *pid)');
  const titleLength = user.func('int __stdcall GetWindowTextLengthW(void *hwnd)');
  const className = user.func('int __stdcall GetClassNameW(void *hwnd, _Out_ uint16 *name, int length)');
  const style = user.func('intptr_t __stdcall GetWindowLongPtrW(void *hwnd, int index)');
  const attribute = dwm.func('int32 __stdcall DwmGetWindowAttribute(void *hwnd, uint32 attr, void *value, uint32 size)');
  const foreground = user.func('void * __stdcall GetForegroundWindow()');
  const id = (hwnd: unknown) => k.address(hwnd).toString();
  return {
    list() {
      const result: WindowInfo[] = [];
      // Never throw through a native callback boundary.
      let failure: unknown;
      const ok = enumerate((hwnd: unknown) => {
        try {
          if (!visible(hwnd) || !titleLength(hwnd) || (Number(style(hwnd, -20)) & 0x80)) return true;
          const name = new Uint16Array(256); className(hwnd, name, name.length);
          const cls = String.fromCharCode(...name).split('\0')[0];
          if (['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd'].includes(cls!)) return true;
          const cloaked = Buffer.alloc(4);
          if (attribute(hwnd, 14, cloaked, 4) !== 0) throw new Error('DWMWA_CLOAKED failed');
          if (cloaked.readUInt32LE()) return true;
          const buffer = Buffer.alloc(k.sizeof(RECT));
          if (attribute(hwnd, 9, buffer, buffer.length) !== 0) throw new Error('DWMWA_EXTENDED_FRAME_BOUNDS failed');
          const r = k.decode(buffer, RECT);
          const bounds = toDip({ x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top });
          if (bounds.width < 120 || bounds.height < 120) return true;
          const owner = [0]; pid(hwnd, owner);
          result.push({ id: id(hwnd), bounds, minimized: !!iconic(hwnd), ownerPid: owner[0] });
        } catch (error) { failure = error; return false; }
        return true;
      }, 0);
      if (failure) throw failure;
      if (!ok) throw new Error('EnumWindows failed');
      return result;
    },
    foreground: windows => { const hwnd = foreground(); return hwnd ? windows.find(w => w.id === id(hwnd)) : undefined; },
  };
}
function macApi(k: Koffi): NativeWindows {
  const cg = k.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
  const cf = k.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
  const point = k.struct({ x: 'double', y: 'double' }), size = k.struct({ width: 'double', height: 'double' });
  const rect = k.struct({ origin: point, size });
  const list = cg.func('void *CGWindowListCopyWindowInfo(uint32 options, uint32 relativeToWindow)');
  const boundsFromDictionary = cg.func('CGRectMakeWithDictionaryRepresentation', 'bool', ['void *', k.out(k.pointer(rect))]);
  const count = cf.func('long CFArrayGetCount(void *array)');
  const at = cf.func('void *CFArrayGetValueAtIndex(void *array, long index)');
  const get = cf.func('void *CFDictionaryGetValue(void *dictionary, void *key)');
  const number = cf.func('bool CFNumberGetValue(void *number, int type, _Out_ int64 *value)');
  const release = cf.func('void CFRelease(void *object)');
  const keys = Object.fromEntries(['Bounds', 'Layer', 'OwnerPID', 'Number'].map(name =>
    [name, k.decode(cg.symbol(`kCGWindow${name}`, 'void *'), 'void *')]));
  const integer = (dict: unknown, key: string) => {
    const value = [0]; const ref = get(dict, keys[key]);
    if (!ref || !number(ref, 4, value)) throw new Error(`CGWindow ${key} missing`);
    return Number(value[0]);
  };
  return {
    list() {
      const array = list(1 | 16, 0);
      if (!array) throw new Error('CGWindowListCopyWindowInfo failed');
      try {
        const result: WindowInfo[] = [];
        for (let i = 0; i < count(array); i++) {
          const dict = at(array, i);
          if (integer(dict, 'Layer') !== 0) continue;
          const output: { origin?: { x: number; y: number }; size?: { width: number; height: number } } = {};
          if (!boundsFromDictionary(get(dict, keys.Bounds), output) || !output.origin || !output.size) throw new Error('CGWindow bounds missing');
          result.push({ id: String(integer(dict, 'Number')), bounds: { ...output.origin, ...output.size },
            minimized: false, ownerPid: integer(dict, 'OwnerPID') });
        }
        return result;
      } finally { release(array); }
    },
    foreground: windows => windows[0],
  };
}
