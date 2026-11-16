import { contextBridge, ipcRenderer } from 'electron';
import type { CursorSample, DragSample, MoveResult, PetBridge, SmokeBehavior } from '../shared/types';

function listen<T>(channel: string, callback: (value: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const bridge: PetBridge = {
  contextMenu: () => ipcRenderer.send('pet:context-menu'),
  getConfig: () => ipcRenderer.invoke('pet:config'),
  onConfig: callback => listen('config:changed', callback),
  onExpression: callback => listen('pet:expression', callback),
  onSound: callback => listen('pet:play-sound', callback),
  windowInfo: () => ipcRenderer.invoke('pet:window-info'),
  moveTo: (request) => ipcRenderer.send('pet:move-to', request),
  cancelMove: () => ipcRenderer.send('pet:move-cancel'),
  loadSound: (use) => ipcRenderer.invoke('pet:sound', use),
  onMoveDone: (callback) => listen<MoveResult>('pet:move-done', callback),
  onVisibility: (callback) => listen<{ visible: boolean }>('pet:visibility', callback),
  onPress: (callback) => listen<boolean>('pet:press', callback),
  onDrag: (callback) => listen<DragSample>('pet:drag', callback),
  onSmokePose: (callback) => listen<SmokeBehavior>('pet:smoke-pose', callback),
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
