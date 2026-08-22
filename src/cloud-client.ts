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
