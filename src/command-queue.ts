// Presence Desktop Agent — fila de comandos nuvem→dispositivo (roteiro
// original da arquitetura, "Fase F" — não confundir com a Fase 10F da
// sequência da Jheny, que é Permission Manager).
//
// Caso de uso: um comando digitado no app web/celular ("abre o Claude
// no meu notebook") precisa chegar até aqui. Diferente do fluxo local
// (wake word/palmas → comando, `voice-interaction.ts`), que é síncrono,
// este caminho é assíncrono — faz polling curto (3-5s, decisão já
// registrada na arquitetura) contra `/api/presence/agent/commands/poll`.
//
// Reaproveita tudo que já existe, sem mecanismo paralelo: o mesmo
// `command-resolver.ts`/`execution-engine.ts` que a voz usa (Permission
// Manager, confirmação e Audit Log se aplicam igual, venha o comando de
// onde vier) e a mesma credencial de dispositivo (`device-store.ts`).
// Só faz polling quando pareado; nunca inventa um comando ou finge
// sucesso quando a fila está vazia. Quando o resolvedor determinístico
// não bate com nada, cai pro Planner (`planner.ts`, Fase H) antes de
// desistir — mesmo princípio Local-First/AI-on-demand.

import { completeCommand, pollNextCommand } from "./cloud-client";
import { resolveAndExecuteCommand, type CommandResolution } from "./command-resolver";
import { loadDeviceCredential } from "./device-store";
import { planAndExecuteCommand, type PlannerResolution } from "./planner";

const DEFAULT_POLL_INTERVAL_MS = 4000;

export type CommandQueueStatus = "idle" | "polling" | "error";

interface ReceivedEvent {
  id: string;
  text: string;
}

interface CompletedEvent {
  id: string;
  text: string;
  status: "done" | "failed";
  resolution: CommandResolution | PlannerResolution;
}

type StatusListener = (status: CommandQueueStatus, detail?: string) => void;
type ReceivedListener = (event: ReceivedEvent) => void;
type CompletedListener = (event: CompletedEvent) => void;

const statusListeners = new Set<StatusListener>();
const receivedListeners = new Set<ReceivedListener>();
const completedListeners = new Set<CompletedListener>();

let timer: ReturnType<typeof setInterval> | null = null;
let pollInFlight = false;

export function onCommandQueueStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function onCommandReceived(listener: ReceivedListener): () => void {
  receivedListeners.add(listener);
  return () => receivedListeners.delete(listener);
}

export function onCommandCompleted(listener: CompletedListener): () => void {
  completedListeners.add(listener);
  return () => completedListeners.delete(listener);
}

/** Idempotente — chamar de novo com o poller já rodando é um no-op. */
export function startCommandQueuePolling(intervalMs = DEFAULT_POLL_INTERVAL_MS): void {
  if (timer) return;
  timer = setInterval(() => void pollOnce(), intervalMs);
}

export function stopCommandQueuePolling(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

async function pollOnce(): Promise<void> {
  if (pollInFlight) return; // um polling em andamento nunca se sobrepõe ao próximo tick
  pollInFlight = true;

  try {
    // Faz polling só quando pareado — nunca chama a nuvem sem credencial
    // (evitaria só um erro previsível de not-paired em loop).
    const credential = await loadDeviceCredential();
    if (!credential) return;

    setStatus("polling");
    const command = await pollNextCommand();
    if (!command) {
      setStatus("idle");
      return;
    }

    for (const listener of receivedListeners) listener({ id: command.id, text: command.text });

    // Filtra localmente primeiro (Local-First/AI-on-demand): só recorre
    // ao Planner (IA, Fase H) quando o resolvedor determinístico não
    // bate com nada conhecido.
    const deterministic = await resolveAndExecuteCommand(command.text);
    const resolution: CommandResolution | PlannerResolution = deterministic.matched
      ? deterministic
      : await planAndExecuteCommand(command.text);
    const status = resolutionStatus(resolution);
    await completeCommand(command.id, status, resolution);

    for (const listener of completedListeners) {
      listener({ id: command.id, text: command.text, status, resolution });
    }
    setStatus("idle");
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : String(error));
  } finally {
    pollInFlight = false;
  }
}

/**
 * Um comando que não bate com nada conhecido, nem determinístico nem
 * pelo Planner, é reportado como `failed` pra nuvem — nunca fica preso
 * em `delivered` pra sempre, mas também nunca finge que fez algo que
 * não fez.
 */
function resolutionStatus(resolution: CommandResolution | PlannerResolution): "done" | "failed" {
  if ("matched" in resolution) return !resolution.matched ? "failed" : resolution.ok ? "done" : "failed";
  if (resolution.status === "executed") return resolution.allSucceeded ? "done" : "failed";
  return "failed";
}

function setStatus(status: CommandQueueStatus, detail?: string): void {
  for (const listener of statusListeners) listener(status, detail);
}
