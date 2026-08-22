// Presence Desktop Agent — Fase 10D: Voice Mode / interação por comando.
//
// Depois da wake word ("Presence", Fase 10B) ou das duas palmas (Fase
// 10C), entra em modo de escuta e captura o comando falado via STT
// (`stt-window.ts`). Nesta fatia, só CAPTURA e EXPÕE o texto do
// comando pro Main/UI — executar o que foi pedido é escopo da Fase
// 10E (Tool Registry), ainda não implementada; não antecipar isso
// aqui.

import { onClapDetected, onWakeDetected } from "./audio-manager";
import { captureVoiceCommand } from "./stt-window";

export type VoiceInteractionState = "idle" | "listening" | "error";

type StateListener = (state: VoiceInteractionState) => void;
type CommandListener = (event: { transcript: string }) => void;

let listening = false;
const stateListeners = new Set<StateListener>();
const commandListeners = new Set<CommandListener>();

export function startVoiceInteractionListener(): void {
  onWakeDetected(() => void handleTrigger());
  onClapDetected(() => void handleTrigger());
}

export function onVoiceInteractionState(listener: StateListener): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

export function onCommandCaptured(listener: CommandListener): () => void {
  commandListeners.add(listener);
  return () => commandListeners.delete(listener);
}

async function handleTrigger(): Promise<void> {
  if (listening) return; // já ouvindo um comando — ignora um segundo gatilho sobreposto
  listening = true;
  setState("listening");

  const result = await captureVoiceCommand();

  if (result.status === "ok" && result.transcript.trim().length > 0) {
    for (const listener of commandListeners) listener({ transcript: result.transcript });
    setState("idle");
  } else {
    setState("error");
    setState("idle");
  }

  listening = false;
}

function setState(state: VoiceInteractionState): void {
  for (const listener of stateListeners) listener(state);
}
