// Presence Desktop Agent — Fase 10B: Audio Worker.
//
// Roda como `utilityProcess` do Electron (processo isolado do Main —
// ver arquitetura aprovada: "sobrevive a crash sem derrubar o Main").
// Única responsabilidade: capturar áudio contínuo do microfone e rodar
// engines de detecção sobre o mesmo stream de PCM. Nesta fatia, só o
// Wake Word ("Presence"); a detecção de duas palmas (Fase 10C) vai
// plugar no mesmo laço de frames abaixo, sem precisar de um segundo
// pipeline de áudio.
//
// Nunca repassa os frames crus pro Main — só eventos discretos
// (`status`, `wake_detected`), exatamente como a arquitetura exige.

import type { AudioWorkerToMain } from "./audio-worker-messages";
import { createWakeWordEngine } from "./wake-word-engine";

function post(message: AudioWorkerToMain): void {
  process.parentPort.postMessage(message);
}

async function main(): Promise<void> {
  let PvRecorder: typeof import("@picovoice/pvrecorder-node").PvRecorder;
  try {
    PvRecorder = (await import("@picovoice/pvrecorder-node")).PvRecorder;
  } catch (error) {
    post({ type: "status", recorder: "error", wakeWord: "error", detail: describeError(error) });
    return;
  }

  const wakeWord = createWakeWordEngineSafely();
  const frameLength = wakeWord?.engine?.frameLength ?? 512;

  post({
    type: "status",
    recorder: "starting",
    wakeWord: wakeWord.state,
    detail: wakeWord.detail,
  });

  let recorder: InstanceType<typeof PvRecorder>;
  try {
    recorder = new PvRecorder(frameLength, -1);
    recorder.start();
  } catch (error) {
    post({ type: "status", recorder: "error", wakeWord: wakeWord.state, detail: `microfone indisponível: ${describeError(error)}` });
    return;
  }

  post({ type: "status", recorder: "listening", wakeWord: wakeWord.state, detail: wakeWord.detail });

  let stopping = false;
  process.parentPort.on("message", (event) => {
    const data = event.data as { type?: string } | undefined;
    if (data?.type === "stop") stopping = true;
  });

  while (!stopping && recorder.isRecording) {
    const frame = await recorder.read();
    if (wakeWord.engine) {
      const keywordIndex = wakeWord.engine.process(frame);
      if (keywordIndex >= 0) {
        post({ type: "wake_detected", at: new Date().toISOString() });
      }
    }
  }

  recorder.stop();
  recorder.release();
  wakeWord.engine?.release();
  post({ type: "status", recorder: "stopped", wakeWord: "not_configured" });
  process.exit(0);
}

function createWakeWordEngineSafely(): {
  engine: ReturnType<typeof createWakeWordEngine>;
  state: "not_configured" | "listening" | "error";
  detail?: string;
} {
  try {
    const engine = createWakeWordEngine();
    return { engine, state: engine ? "listening" : "not_configured" };
  } catch (error) {
    return { engine: null, state: "error", detail: describeError(error) };
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void main();
