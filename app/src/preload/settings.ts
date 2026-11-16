import { contextBridge, ipcRenderer } from 'electron';
import type { WeatherSettingsBridge } from '../shared/types';
import { listen } from './listen';
const bridge: WeatherSettingsBridge = {
  weatherCity: () => ipcRenderer.invoke('settings:weather-city'),
  load: () => ipcRenderer.invoke('settings:load'), save: (config, key) => ipcRenderer.invoke('settings:save', config, key),
  revealKey: () => ipcRenderer.invoke('settings:reveal'), test: () => ipcRenderer.invoke('settings:test'),
  onConfig: callback => listen('config:changed', callback), onSaveClose: callback => listen('settings:save-close', callback),
  closeReady: () => ipcRenderer.send('settings:close-ready'),
};
contextBridge.exposeInMainWorld('settings', bridge);
