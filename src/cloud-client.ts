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
