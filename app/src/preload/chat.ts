import { contextBridge, ipcRenderer } from 'electron';
import type { ChatBridge } from '../shared/ui';
import { listen } from './listen';
const bridge: ChatBridge = {
  load: () => ipcRenderer.invoke('chat:load'), send: text => ipcRenderer.invoke('chat:send', text),
  stop: () => ipcRenderer.invoke('chat:stop'), clear: () => ipcRenderer.invoke('chat:clear'),
  settings: () => ipcRenderer.send('chat:settings'), onEvent: callback => listen('chat:event', callback),
};
contextBridge.exposeInMainWorld('chat', bridge);
