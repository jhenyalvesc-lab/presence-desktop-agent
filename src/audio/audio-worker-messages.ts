// Presence Desktop Agent — Fase 10B: contrato de mensagens entre o Audio
// Worker (utilityProcess) e o Main Process. Compartilhado pelos dois
// lados pra manter os dois em sincronia sem duplicar tipos.

export type RecorderState = "starting" | "listening" | "stopped" | "error";
export type WakeWordState = "not_configured" | "listening" | "error";
export type ClapState = "disabled" | "listening";

export type AudioWorkerToMain =
  | { type: "status"; recorder: RecorderState; wakeWord: WakeWordState; clap: ClapState; detail?: string }
  | { type: "wake_detected"; at: string }
  | { type: "clap_detected"; at: string };

export type MainToAudioWorker = { type: "stop" };
