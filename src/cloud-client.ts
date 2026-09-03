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
  speech?: string,
): Promise<void> {
  const headers = await authHeader();
  const response = await fetch(`${CLOUD_BASE_URL}/api/presence/agent/commands/complete`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ id, status, result, speech }),
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

export interface SummarizeMessage {
  fromMe: boolean;
  author: string | null;
  text: string;
  kind: "text" | "audio";
}

/**
 * Pedido explícito da Jheny (2026-09-03) — resumo de verdade de uma
 * conversa do WhatsApp já lida (`whatsapp-actions.ts`), nunca o áudio em
 * si (só texto, incluindo transcrição de áudio já feita localmente).
 * Mesmo backend/mesma API da OpenAI que o Planner já usa — custo real
 * de LLM, cobrado na conta configurada (`OPENAI_API_KEY`, nuvem), nunca
 * de graça — ver `handle-agent-summarize-request.ts` (repositório
 * principal) pro rate limit que protege contra custo descontrolado.
 */
export async function requestConversationSummary(
  chatName: string,
  dayLabel: string,
  messages: SummarizeMessage[],
): Promise<string> {
  const headers = await authHeader();
  const response = await fetch(`${CLOUD_BASE_URL}/api/presence/agent/summarize`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ chatName, dayLabel, messages }),
  });
  if (!response.ok) throw new Error(`presence-agent/summarize-failed-${response.status}`);
  const body = (await response.json()) as { summary: string };
  return body.summary;
}

export type CloudToolOutcome =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

/**
 * Ponte Desktop Agent ↔ Agent Core da nuvem (2026-09-03, pedido explícito
 * da Jheny: "quero que ele faça tudo o que o online faz dentro do
 * desktop"). Executa de verdade UMA ferramenta do catálogo de nuvem
 * (`src/tools/cloud-tools.ts`) — diferente de `requestPlan` (só propõe
 * passos), aqui já é a execução real, autenticada por credencial de
 * dispositivo (o mesmo `userId` que o chat do site usaria, resolvido no
 * backend a partir do pareamento — nunca um id que o próprio agente
 * escolhe). A confirmação de ações `destructive`/`external_comm` já
 * aconteceu ANTES desta chamada (Execution Engine local, mesmo Permission
 * Manager de qualquer outra ferramenta) — ver `handle-agent-execute-request.ts`
 * (repositório principal) pro porquê disso ser seguro executar direto.
 */
export async function executeCloudTool(tool: string, args: unknown): Promise<CloudToolOutcome> {
  const headers = await authHeader();
  const response = await fetch(`${CLOUD_BASE_URL}/api/presence/agent/execute`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ tool, args }),
  });
  if (!response.ok) throw new Error(`presence-agent/execute-failed-${response.status}`);
  return (await response.json()) as CloudToolOutcome;
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
