// Presence Desktop Agent — Fase A: comunicação com o backend cloud.
//
// Reutiliza exatamente os endpoints já implementados e publicados no
// repositório principal (`presence-37deb226`, Fase 10A) — nenhum
// mecanismo paralelo. `fetch` global do Node (Electron embute uma
// versão recente do Node, sem precisar de `node-fetch`).

import { CLOUD_BASE_URL } from "./config";
import { loadDeviceCredential } from "./device-store";

export interface PairStartResponse {
  pairId: string;
  code: string;
  expiresInSeconds: number;
}

export async function startPairing(): Promise<PairStartResponse> {
  const response = await fetch(`${CLOUD_BASE_URL}/api/presence/agent/pair/start`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(`presence-agent/pair-start-failed-${response.status}`);
  return (await response.json()) as PairStartResponse;
}

export type PairStatusResponse =
  | { status: "pending" }
  | { status: "ready"; deviceId: string; deviceSecret: string }
  | { status: "expired" };

export async function checkPairingStatus(pairId: string): Promise<PairStatusResponse> {
  const response = await fetch(
    `${CLOUD_BASE_URL}/api/presence/agent/pair/status?pairId=${encodeURIComponent(pairId)}`,
  );
  if (!response.ok) throw new Error(`presence-agent/pair-status-failed-${response.status}`);
  return (await response.json()) as PairStatusResponse;
}

export interface PingResult {
  ok: true;
  serverTime: string;
}

/** Prova o round-trip credencial-de-dispositivo → nuvem. Lança se ainda não houver pareamento. */
export async function pingCloud(): Promise<PingResult> {
  const credential = await loadDeviceCredential();
  if (!credential) throw new Error("presence-agent/not-paired");

  const response = await fetch(`${CLOUD_BASE_URL}/api/presence/agent/ping`, {
    method: "POST",
    headers: { authorization: `Bearer ${credential.deviceId}.${credential.deviceSecret}` },
  });
  if (!response.ok) throw new Error(`presence-agent/ping-failed-${response.status}`);
  return (await response.json()) as PingResult;
}

async function authHeader(): Promise<Record<string, string>> {
  const credential = await loadDeviceCredential();
  if (!credential) throw new Error("presence-agent/not-paired");
  return { authorization: `Bearer ${credential.deviceId}.${credential.deviceSecret}` };
}

export interface QueuedCommand {
  id: string;
  text: string;
}

/**
 * Reivindica o próximo comando pendente pra este dispositivo (fila
 * nuvem→dispositivo, `agent_commands`/`claim_next_agent_command` — Fase
 * 10 do repositório principal). `null` significa "fila vazia agora",
 * não erro.
 */
export async function pollNextCommand(): Promise<QueuedCommand | null> {
  const headers = await authHeader();
  const response = await fetch(`${CLOUD_BASE_URL}/api/presence/agent/commands/poll`, {
    method: "POST",
    headers,
  });
  if (!response.ok) throw new Error(`presence-agent/commands-poll-failed-${response.status}`);
  const body = (await response.json()) as { command: { id: string; text: string } | null };
  return body.command;
}

/** Reporta o resultado de um comando já reivindicado via `pollNextCommand`. */
export async function completeCommand(
  id: string,
  status: "done" | "failed",
  result: unknown,
): Promise<void> {
  const headers = await authHeader();
  const response = await fetch(`${CLOUD_BASE_URL}/api/presence/agent/commands/complete`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ id, status, result }),
  });
  if (!response.ok) throw new Error(`presence-agent/commands-complete-failed-${response.status}`);
}

export interface PlanToolDescriptor {
  name: string;
  description: string;
  riskTier: string;
  argsHint?: string;
}

export interface PlanStep {
  tool: string;
  argsJson: string;
  label: string;
}

export interface PlanResponse {
  steps: PlanStep[];
  clarification: string | null;
}

/**
 * Planner (Fase H) — pede ao backend pra decompor um comando composto
 * numa sequência de passos, cada um usando só ferramentas que este
 * agente de fato tem (`tools`, construído a partir do Tool Registry
 * local). O backend NUNCA executa nada — só propõe; quem valida e
 * executa de verdade é o próprio agente (`planner.ts`), passo a passo,
 * pelo mesmo Execution Engine de sempre.
 */
export async function requestPlan(command: string, tools: PlanToolDescriptor[]): Promise<PlanResponse> {
  const headers = await authHeader();
  const response = await fetch(`${CLOUD_BASE_URL}/api/presence/agent/plan`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ command, tools }),
  });
  if (!response.ok) throw new Error(`presence-agent/plan-failed-${response.status}`);
  return (await response.json()) as PlanResponse;
}

export interface AuditEntryPayload {
  tool: string;
  args?: unknown;
  riskTier: string;
  confirmationOutcome: string;
  outcome: string;
  detail?: string;
}

/**
 * Sincroniza uma entrada do Audit Log local (`audit-log.ts`) pra nuvem
 * (`agent_audit_log`, Fase 10, roteiro original "Fase I"). Quem chama
 * isto trata como best-effort — nunca deixa uma falha aqui (sem
 * pareamento, rede indisponível, etc.) derrubar a execução real da
 * ferramenta; o log local continua sendo a fonte de verdade.
 */
export async function sendAuditEntry(entry: AuditEntryPayload): Promise<void> {
  const headers = await authHeader();
  const response = await fetch(`${CLOUD_BASE_URL}/api/presence/agent/audit`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!response.ok) throw new Error(`presence-agent/audit-sync-failed-${response.status}`);
}

/**
 * Voz do Presence (roteiro original: "resposta em voz" da interação por
 * comando) — pede ao backend pra sintetizar `text` na mesma voz oficial
 * do produto (ElevenLabs, `/api/presence/agent/speech`, device-autenticado
 * — o Desktop Agent nunca segura o JWT de sessão que o endpoint de voz
 * do app web exige). Devolve os bytes de áudio (mp3); tocar é
 * responsabilidade de quem chama (ver `speech-output.ts`).
 */
export async function requestSpeech(text: string): Promise<Buffer> {
  const headers = await authHeader();
  const response = await fetch(`${CLOUD_BASE_URL}/api/presence/agent/speech`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(`presence-agent/speech-failed-${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Saudação espontânea ao acordar (duas palmas/wake word) — pede à nuvem
 * uma frase gerada na hora pela IA (nunca fixa no código), reaproveitando
 * o mesmo mecanismo já usado pela Voice Mode do site
 * (`/api/presence/agent/greeting`, device-autenticado).
 */
export async function requestGreeting(): Promise<string> {
  const headers = await authHeader();
  const response = await fetch(`${CLOUD_BASE_URL}/api/presence/agent/greeting`, {
    method: "POST",
    headers,
  });
  if (!response.ok) throw new Error(`presence-agent/greeting-failed-${response.status}`);
  const body = (await response.json()) as { speech: string };
  return body.speech;
}
