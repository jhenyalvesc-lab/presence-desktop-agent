// Presence Desktop Agent — Fase 10B: dono do ciclo de vida do Audio
// Worker no Main Process. Nunca processa PCM diretamente aqui — só
// recebe os eventos discretos que o worker emite (ver
// `audio/audio-worker-messages.ts`).

import { utilityProcess, type UtilityProcess } from "electron";
import path from "node:path";

import type { AudioWorkerToMain, RecorderState, WakeWordState } from "./audio/audio-worker-messages";

export interface AudioStatus {
  recorder: RecorderState | "idle";
  wakeWord: WakeWordState | "disabled";
  detail?: string;
}

type StatusListener = (status: AudioStatus) => void;
type WakeListener = (event: { at: string }) => void;

let worker: UtilityProcess | null = null;
let lastStatus: AudioStatus = { recorder: "idle", wakeWord: "disabled" };
const statusListeners = new Set<StatusListener>();
const wakeListeners = new Set<WakeListener>();

export function startAudioWorker(): void {
  if (worker) return;

  worker = utilityProcess.fork(path.join(__dirname, "audio", "audio-worker.js"), [], { stdio: "pipe" });

  worker.on("message", (message: AudioWorkerToMain) => handleMessage(message));
  worker.on("exit", (code) => {
    worker = null;
    setStatus({
      recorder: code === 0 ? "stopped" : "error",
      wakeWord: "disabled",
      detail: code === 0 ? undefined : `Audio Worker saiu com código ${code}`,
    });
  });
}

export function stopAudioWorker(): void {
  worker?.kill();
  worker = null;
}

export function getAudioStatus(): AudioStatus {
  return lastStatus;
}

export function onAudioStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function onWakeDetected(listener: WakeListener): () => void {
  wakeListeners.add(listener);
  return () => wakeListeners.delete(listener);
}

function setStatus(status: AudioStatus): void {
  lastStatus = status;
  for (const listener of statusListeners) listener(status);
}

function handleMessage(message: AudioWorkerToMain): void {
  if (message.type === "status") {
    setStatus({ recorder: message.recorder, wakeWord: message.wakeWord, detail: message.detail });
  } else if (message.type === "wake_detected") {
    for (const listener of wakeListeners) listener({ at: message.at });
  }
}
