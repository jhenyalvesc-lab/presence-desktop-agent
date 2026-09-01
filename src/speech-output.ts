// Presence Desktop Agent — Voz do Presence (roteiro original: "resposta
// em voz" da interação por comando, wake word/duas palmas).
//
// Reaproveita a mesma síntese ElevenLabs oficial do produto via
// `requestSpeech` (nuvem, device-autenticado) — nenhuma voz local nem
// mecanismo paralelo. Tocar o áudio de verdade é responsabilidade do
// Renderer (não existe API de áudio no Main Process do Electron); este
// módulo só busca os bytes e publica um evento com o áudio em base64
// pro Main encaminhar — mesmo padrão de `audit-log.ts`/`onAuditEntry`.
//
// Best-effort de propósito: uma falha de voz (sem pareamento, rede
// fora do ar, erro da ElevenLabs) nunca deve travar nem derrubar a
// execução real do comando que já aconteceu — o resultado já foi
// decidido antes desta chamada, falar em voz é só um complemento.

import { requestSpeech } from "./cloud-client";

type AudioListener = (base64Mp3: string) => void;
const listeners = new Set<AudioListener>();

export function onSpeechAudioReady(listener: AudioListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// `speak()` precisa que quem chama possa esperar o áudio TERMINAR de tocar
// (ex.: falar a saudação antes de começar a escutar o comando) — o
// Renderer avisa via `agent:speech-audio-ended` (ver renderer.js/main.ts)
// quando o <audio> dispara `ended`/`error`. Timeout de segurança: nunca
// trava pra sempre se esse sinal não chegar por algum motivo.
const SPEECH_PLAYBACK_TIMEOUT_MS = 20_000;
let pendingEndResolvers: (() => void)[] = [];

/** Chamado pelo Main quando o Renderer confirma que o áudio acabou de tocar. */
export function notifySpeechAudioEnded(): void {
  const resolvers = pendingEndResolvers;
  pendingEndResolvers = [];
  for (const resolve of resolvers) resolve();
}

export async function speak(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  try {
    const audio = await requestSpeech(trimmed);
    const base64 = audio.toString("base64");
    for (const listener of listeners) listener(base64);

    await new Promise<void>((resolve) => {
      pendingEndResolvers.push(resolve);
      setTimeout(resolve, SPEECH_PLAYBACK_TIMEOUT_MS);
    });
  } catch {
    // Best-effort — ver comentário do módulo. Nunca lança pra quem chamou.
  }
}
