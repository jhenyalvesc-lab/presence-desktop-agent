// Presence Desktop Agent — Audio Worker.
//
// Roda como `utilityProcess` do Electron (processo isolado do Main —
// ver arquitetura aprovada: "sobrevive a crash sem derrubar o Main").
// Única responsabilidade: capturar áudio contínuo do microfone e rodar
// engines de detecção sobre o mesmo stream de PCM — Wake Word
// ("Presence", Fase 10B) e duas palmas (Fase 10C), sem um segundo
// pipeline de áudio pra cada um.
//
// Nunca repassa os frames crus pro Main — só eventos discretos
// (`status`, `wake_detected`, `clap_detected`), exatamente como a
// arquitetura exige.

import { ClapDetector, isClapDetectionEnabled, readClapConfigFromEnv } from "./clap-detector";
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
    post({ type: "status", recorder: "error", wakeWord: "error", clap: "disabled", detail: describeError(error) });
    return;
  }

  const wakeWord = createWakeWordEngineSafely();
  const clapDetector = isClapDetectionEnabled() ? new ClapDetector(readClapConfigFromEnv()) : null;
  const frameLength = wakeWord?.engine?.frameLength ?? 512;

  post({
    type: "status",
    recorder: "starting",
    wakeWord: wakeWord.state,
    clap: clapDetector ? "listening" : "disabled",
    detail: wakeWord.detail,
  });

  let recorder: InstanceType<typeof PvRecorder>;
  try {
    recorder = new PvRecorder(frameLength, -1);
    recorder.start();
  } catch (error) {
    post({
      type: "status",
      recorder: "error",
      wakeWord: wakeWord.state,
      clap: clapDetector ? "listening" : "disabled",
      detail: `microfone indisponível: ${describeError(error)}`,
    });
    return;
  }

  post({ type: "status", recorder: "listening", wakeWord: wakeWord.state, clap: clapDetector ? "listening" : "disabled", detail: wakeWord.detail });

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

    if (clapDetector?.process(frame)) {
      post({ type: "clap_detected", at: new Date().toISOString() });
    }
  }

  recorder.stop();
  recorder.release();
  wakeWord.engine?.release();
  post({ type: "status", recorder: "stopped", wakeWord: "not_configured", clap: "disabled" });
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
