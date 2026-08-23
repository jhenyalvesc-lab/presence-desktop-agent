// Presence Desktop Agent — Voice Mode / interação por comando.
//
// Depois da wake word ("Presence", Fase 10B) ou das duas palmas (Fase
// 10C), entra em modo de escuta e captura o comando falado via STT
// (`stt-window.ts`, Fase 10D). O texto capturado é sempre exposto pro
// Main/UI; além disso (Fase 10E), tenta resolvê-lo de forma
// determinística contra o Tool Registry (`command-resolver.ts`) — só
// "abre/abra X" por enquanto. Quando o determinístico não bate com
// nada, cai pro Planner (`planner.ts`, Fase H) antes de desistir —
// mesmo princípio Local-First/AI-on-demand: filtra localmente primeiro,
// só recorre à IA depois.

import { onClapDetected, onWakeDetected } from "./audio-manager";
import { resolveAndExecuteCommand, type CommandResolution } from "./command-resolver";
import { planAndExecuteCommand, type PlannerResolution } from "./planner";
import { captureVoiceCommand } from "./stt-window";

export type VoiceInteractionState = "idle" | "listening" | "error";

type StateListener = (state: VoiceInteractionState) => void;
type CommandListener = (event: { transcript: string }) => void;
type ResolutionListener = (resolution: CommandResolution) => void;
type PlannerListener = (resolution: PlannerResolution) => void;

let listening = false;
const stateListeners = new Set<StateListener>();
const commandListeners = new Set<CommandListener>();
const resolutionListeners = new Set<ResolutionListener>();
const plannerListeners = new Set<PlannerListener>();

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

export function onCommandResolution(listener: ResolutionListener): () => void {
  resolutionListeners.add(listener);
  return () => resolutionListeners.delete(listener);
}

export function onPlannerResolution(listener: PlannerListener): () => void {
  plannerListeners.add(listener);
  return () => plannerListeners.delete(listener);
}

async function handleTrigger(): Promise<void> {
  if (listening) return; // já ouvindo um comando — ignora um segundo gatilho sobreposto
  listening = true;
  setState("listening");

  const result = await captureVoiceCommand();

  if (result.status === "ok" && result.transcript.trim().length > 0) {
    for (const listener of commandListeners) listener({ transcript: result.transcript });

    const resolution = await resolveAndExecuteCommand(result.transcript);
    if (resolution.matched) {
      for (const listener of resolutionListeners) listener(resolution);
    } else {
      // Filtra localmente primeiro: só recorre ao Planner (IA, Fase H)
      // depois que o resolvedor determinístico já não bateu com nada.
      const plan = await planAndExecuteCommand(result.transcript);
      for (const listener of plannerListeners) listener(plan);
    }

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
