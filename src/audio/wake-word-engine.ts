// Presence Desktop Agent — Fase 10B: wrapper fino sobre o Porcupine.
//
// Wake word ("acordar", em português) é uma keyword CUSTOM — o Porcupine
// não vem com ela pré-treinada (ver `BuiltinKeyword` do pacote). Ativar
// isso de verdade exige duas coisas que só a Jheny pode fornecer, cada
// uma pessoal e não fabricável por código:
//   1. Uma AccessKey gratuita da conta dela no Picovoice Console
//      (https://console.picovoice.ai/).
//   2. Um arquivo `.ppn` da keyword "acordar" (idioma português)
//      treinado nesse mesmo console, exportado para Windows (o console
//      gera um arquivo por plataforma-alvo).
//
// Sem as duas, `createWakeWordEngine()` devolve `null` e o Audio Worker
// continua rodando (mic, detecção de palmas) só sem wake word — nunca
// trava o processo por causa disso.
//
// Keywords fora do inglês exigem o arquivo de modelo do idioma
// (`porcupine_params_<idioma>.pv`, baixado do repositório oficial do
// Porcupine) — sem ele, o Porcupine tenta interpretar o `.ppn` com o
// modelo em inglês (padrão) e recusa. `assets/porcupine_params_pt.pv`
// (empacotado junto do app, mesmo padrão de `assets/app-icon.png`) já
// cobre o caso de uso atual (português); `PRESENCE_WAKE_WORD_MODEL_PATH`
// permite apontar pra outro arquivo se isso mudar no futuro.
import path from "node:path";

import { Porcupine } from "@picovoice/porcupine-node";

export interface WakeWordEngine {
  readonly frameLength: number;
  readonly sampleRate: number;
  process(frame: Int16Array): number;
  release(): void;
}

const DEFAULT_PT_MODEL_PATH = path.join(__dirname, "..", "..", "assets", "porcupine_params_pt.pv");

export function createWakeWordEngine(): WakeWordEngine | null {
  const accessKey = process.env["PICOVOICE_ACCESS_KEY"];
  const keywordPath = process.env["PRESENCE_WAKE_WORD_KEYWORD_PATH"];
  if (!accessKey || !keywordPath) return null;

  const modelPath = process.env["PRESENCE_WAKE_WORD_MODEL_PATH"] ?? DEFAULT_PT_MODEL_PATH;
  const porcupine = new Porcupine(accessKey, [keywordPath], [readSensitivity()], { modelPath });
  return {
    frameLength: porcupine.frameLength,
    sampleRate: porcupine.sampleRate,
    process: (frame) => porcupine.process(frame),
    release: () => porcupine.release(),
  };
}

function readSensitivity(): number {
  const raw = process.env["PRESENCE_WAKE_WORD_SENSITIVITY"];
  const parsed = raw ? Number.parseFloat(raw) : 0.6;
  if (Number.isNaN(parsed)) return 0.6;
  return Math.min(1, Math.max(0, parsed));
}
