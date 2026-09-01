// Presence Desktop Agent — Voice Mode / interação por comando.
//
// Depois da wake word ("acordar", Fase 10B) ou das duas palmas (Fase
// 10C), entra em modo de escuta e captura o comando falado via STT
// (`stt-window.ts`, Fase 10D). O texto capturado é sempre exposto pro
// Main/UI; além disso (Fase 10E), tenta resolvê-lo de forma
// determinística contra o Tool Registry (`command-resolver.ts`) — só
// "abre/abra X" por enquanto. Quando o determinístico não bate com
// nada, cai pro Planner (`planner.ts`, Fase H) antes de desistir —
// mesmo princípio Local-First/AI-on-demand: filtra localmente primeiro,
// só recorre à IA depois.

import { showPresenceAppWindow } from "./app-window";
import { onClapDetected, onWakeDetected } from "./audio-manager";
import { requestGreeting } from "./cloud-client";
import { resolveAndExecuteCommand, type CommandResolution } from "./command-resolver";
import { planAndExecuteCommand, type PlannerResolution } from "./planner";
import { composeSpeechForPlan, composeSpeechForResolution } from "./response-composer";
import { speak } from "./speech-output";
import { captureVoiceCommand } from "./stt-window";

export type VoiceInteractionState = "idle" | "listening" | "error";

type StateListener = (state: VoiceInteractionState) => void;
type CommandListener = (event: { transcript: string }) => void;
type ResolutionListener = (resolution: CommandResolution) => void;
type PlannerListener = (resolution: PlannerResolution) => void;

// Agente Universal, Fase F: achado real da auditoria — sem isso, um ruído
// parecido com palma bem no instante em que um ciclo termina (`listening`
// volta a `false`) reabre o Presence imediatamente de novo, sem folga
// nenhuma. Mesmo espírito do guard `if (listening) return` logo abaixo,
// só estendido no tempo depois que o ciclo já fechou.
const TRIGGER_COOLDOWN_MS = 1500;

let listening = false;
let cooldownUntil = 0;
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
  if (Date.now() < cooldownUntil) return; // ciclo acabou de terminar — ignora um gatilho espúrio logo em seguida
  listening = true;

  // Abre a interface completa (o orbe, Treinos, Casa etc. — sempre a
  // versão publicada mais atual) e fala uma saudação espontânea ANTES de
  // escutar — pedido explícito da Jheny: nunca uma frase fixa no código,
  // sempre gerada na hora pela IA (ver handle-agent-greeting-request.ts).
  // Melhor esforço: se a saudação falhar (rede fora do ar etc.), segue
  // direto pra escuta em vez de travar o gatilho inteiro por causa disso.
  showPresenceAppWindow();
  try {
    const greeting = await requestGreeting();
    await speak(greeting);
  } catch (error) {
    console.error("[presence/voice-interaction] falha ao buscar saudação", error);
  }

  setState("listening");

  const result = await captureVoiceCommand();

  if (result.status === "ok" && result.transcript.trim().length > 0) {
    for (const listener of commandListeners) listener({ transcript: result.transcript });

    const resolution = await resolveAndExecuteCommand(result.transcript);
    if (resolution.matched) {
      for (const listener of resolutionListeners) listener(resolution);
      const speech = composeSpeechForResolution(resolution);
      if (speech) void speak(speech);
    } else {
      // Filtra localmente primeiro: só recorre ao Planner (IA, Fase H)
      // depois que o resolvedor determinístico já não bateu com nada.
      const plan = await planAndExecuteCommand(result.transcript);
      for (const listener of plannerListeners) listener(plan);
      void speak(composeSpeechForPlan(plan));
    }

    setState("idle");
  } else {
    setState("error");
    setState("idle");
  }

  listening = false;
  cooldownUntil = Date.now() + TRIGGER_COOLDOWN_MS;
}

function setState(state: VoiceInteractionState): void {
  for (const listener of stateListeners) listener(state);
}
