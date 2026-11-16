import { ipcRenderer } from 'electron';
export function listen<T>(channel: string, callback: (value: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, handler); return () => ipcRenderer.removeListener(channel, handler);
}
