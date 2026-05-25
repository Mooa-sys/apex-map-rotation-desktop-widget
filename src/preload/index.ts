import electron from 'electron';
import type { RotationResponse } from '../shared/mapRotation';

const { contextBridge, ipcRenderer } = electron;

const api = {
  getMapRotation: (force = false): Promise<RotationResponse> =>
    ipcRenderer.invoke('map-rotation:get', force),
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  close: (): Promise<void> => ipcRenderer.invoke('window:close')
};

contextBridge.exposeInMainWorld('apexMap', api);

export type ApexMapApi = typeof api;
