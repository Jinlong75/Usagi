import { contextBridge, ipcRenderer } from 'electron';
import type { QuestionBubbleBridge } from '../shared/types';
import { listen } from './listen';
const bridge: QuestionBubbleBridge = { answer: () => ipcRenderer.invoke('bubble:answer'), onText: callback => listen('bubble:text', callback), resize: height => ipcRenderer.send('bubble:resize', height) };
contextBridge.exposeInMainWorld('bubble', bridge);
