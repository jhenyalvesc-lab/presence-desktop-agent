// Presence Desktop Agent — Fase A: ponte segura IPC main↔renderer.
//
// `contextIsolation: true` + `nodeIntegration: false` (window.ts): o
// renderer nunca tem acesso direto a Node/Electron — só ao que este
// arquivo expõe explicitamente via `contextBridge`. Nunca expõe a
// credencial do dispositivo em si, só resultados de operações.

import { contextBridge, ipcRenderer } from "electron";

export interface AgentStatus {
  paired: boolean;
  deviceId: string | null;
}

export type PairingResult = { status: "ready"; deviceId: string } | { status: "expired" };

contextBridge.exposeInMainWorld("presenceAgent", {
  getStatus: (): Promise<AgentStatus> => ipcRenderer.invoke("agent:get-status"),
  startPairing: (): Promise<PairingResult> => ipcRenderer.invoke("agent:start-pairing"),
  ping: (): Promise<{ ok: true; serverTime: string }> => ipcRenderer.invoke("agent:ping"),
  setAutostart: (enabled: boolean): Promise<{ enabled: boolean }> =>
    ipcRenderer.invoke("agent:set-autostart", enabled),
  onPairingStarted: (callback: (payload: { code: string }) => void): void => {
    ipcRenderer.on("agent:pairing-started", (_event, payload) => callback(payload));
  },
  onPairingTick: (callback: (secondsLeft: number) => void): void => {
    ipcRenderer.on("agent:pairing-tick", (_event, secondsLeft) => callback(secondsLeft));
  },
});
