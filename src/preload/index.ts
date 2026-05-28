import electron from 'electron';
import type { RotationResponse } from '../shared/mapRotation';

const { contextBridge, ipcRenderer } = electron;

const api = {
  getMapRotation: (force = false): Promise<RotationResponse> =>
    ipcRenderer.invoke('map-rotation:get', force),
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  setCompactMode: (compact: boolean): Promise<void> => ipcRenderer.invoke('window:compact', compact),
  startDrag: (): Promise<void> => ipcRenderer.invoke('window:drag-start'),
  moveDrag: (): Promise<void> => ipcRenderer.invoke('window:drag-move'),
  endDrag: (): Promise<void> => ipcRenderer.invoke('window:drag-end'),
  close: (): Promise<void> => ipcRenderer.invoke('window:close')
};

contextBridge.exposeInMainWorld('apexMap', api);

export type ApexMapApi = typeof api;
