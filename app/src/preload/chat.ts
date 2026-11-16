import { contextBridge, ipcRenderer } from 'electron';
import type { RoutineChatBridge } from '../shared/types';
import { listen } from './listen';
const bridge: RoutineChatBridge = {
  load: () => ipcRenderer.invoke('chat:load'), send: text => ipcRenderer.invoke('chat:send', text),
  stop: () => ipcRenderer.invoke('chat:stop'), clear: () => ipcRenderer.invoke('chat:clear'),
  settings: () => ipcRenderer.send('chat:settings'), onEvent: callback => listen('chat:event', callback),
  onHistoryChanged: callback => listen('chat:history-changed', callback),
};
contextBridge.exposeInMainWorld('chat', bridge);
