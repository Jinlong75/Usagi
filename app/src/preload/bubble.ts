import { contextBridge, ipcRenderer } from 'electron';
import type { BubbleBridge } from '../shared/ui';
import { listen } from './listen';
const bridge: BubbleBridge = { onText: callback => listen('bubble:text', callback), resize: height => ipcRenderer.send('bubble:resize', height) };
contextBridge.exposeInMainWorld('bubble', bridge);
