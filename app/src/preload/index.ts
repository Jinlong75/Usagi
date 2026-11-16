import { contextBridge, ipcRenderer } from 'electron';
import type { CursorSample, PetBridge } from '../shared/types';

function listen<T>(channel: string, callback: (value: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const bridge: PetBridge = {
  loadModel: () => ipcRenderer.invoke('pet:load-model'),
  setHit: (hit) => ipcRenderer.send('pet:hit', hit),
  beginDrag: () => ipcRenderer.send('pet:drag-start'),
  endDrag: (cancelled) => ipcRenderer.send('pet:drag-end', cancelled),
  onCursor: (callback) => listen<CursorSample>('pet:cursor', callback),
  onClick: (callback) => listen<void>('pet:click', callback),
  onReload: (callback) => listen<void>('pet:reload', callback),
  rendered: (result) => ipcRenderer.send('pet:rendered', result),
  logError: (message) => ipcRenderer.send('pet:error', message),
};
contextBridge.exposeInMainWorld('pet', bridge);
