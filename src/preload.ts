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

export interface AudioStatus {
  recorder: "idle" | "starting" | "listening" | "stopped" | "error";
  wakeWord: "disabled" | "not_configured" | "listening" | "error";
  clap: "disabled" | "listening";
  detail?: string;
}

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
  getAudioStatus: (): Promise<AudioStatus> => ipcRenderer.invoke("agent:get-audio-status"),
  onAudioStatus: (callback: (status: AudioStatus) => void): void => {
    ipcRenderer.on("agent:audio-status", (_event, status) => callback(status));
  },
  onWakeDetected: (callback: (event: { at: string }) => void): void => {
    ipcRenderer.on("agent:wake-detected", (_event, payload) => callback(payload));
  },
  onClapDetected: (callback: (event: { at: string }) => void): void => {
    ipcRenderer.on("agent:clap-detected", (_event, payload) => callback(payload));
  },
  onVoiceState: (callback: (state: "idle" | "listening" | "error") => void): void => {
    ipcRenderer.on("agent:voice-state", (_event, state) => callback(state));
  },
  onCommandCaptured: (callback: (event: { transcript: string }) => void): void => {
    ipcRenderer.on("agent:command-captured", (_event, payload) => callback(payload));
  },
  onCommandResolved: (callback: (resolution: unknown) => void): void => {
    ipcRenderer.on("agent:command-resolved", (_event, payload) => callback(payload));
  },
  onConfirmationRequest: (callback: (request: { id: string; toolName: string; description: string; riskTier: string }) => void): void => {
    ipcRenderer.on("agent:confirmation-request", (_event, payload) => callback(payload));
  },
  respondToConfirmation: (id: string, approved: boolean): void => {
    ipcRenderer.send("agent:confirmation-response", id, approved);
  },
  getAuditLog: (): Promise<unknown[]> => ipcRenderer.invoke("agent:get-audit-log"),
  onAuditAppended: (callback: (entry: unknown) => void): void => {
    ipcRenderer.on("agent:audit-appended", (_event, payload) => callback(payload));
  },
  getSchedulerStatus: (): Promise<unknown[]> => ipcRenderer.invoke("agent:get-scheduler-status"),
  onSchedulerStatus: (callback: (status: unknown) => void): void => {
    ipcRenderer.on("agent:scheduler-status", (_event, payload) => callback(payload));
  },
});
