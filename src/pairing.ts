// Presence Desktop Agent — Fase A: orquestra o pareamento.
//
// Fluxo: gera o código (pair/start), faz polling curto de pair/status até
// a usuária aprovar no app web (Settings → Desktop Agent) ou o código
// expirar, e salva a credencial recebida — nunca inventa sucesso, nunca
// segue tentando depois de expirado.

import { checkPairingStatus, startPairing } from "./cloud-client";
import { saveDeviceCredential } from "./device-store";

const POLL_INTERVAL_MS = 2000;

export interface PairingSession {
  code: string;
  pairId: string;
  expiresAt: number;
}

export async function beginPairing(): Promise<PairingSession> {
  const { pairId, code, expiresInSeconds } = await startPairing();
  return { code, pairId, expiresAt: Date.now() + expiresInSeconds * 1000 };
}

export type PairingOutcome = { status: "ready"; deviceId: string } | { status: "expired" };

/** Faz polling até a usuária aprovar (ou o código expirar) — só chamadas HTTP simples, nunca IA. */
export async function waitForApproval(
  session: PairingSession,
  onTick?: (secondsLeft: number) => void,
): Promise<PairingOutcome> {
  while (Date.now() < session.expiresAt) {
    const status = await checkPairingStatus(session.pairId);
    if (status.status === "ready") {
      await saveDeviceCredential({ deviceId: status.deviceId, deviceSecret: status.deviceSecret });
      return { status: "ready", deviceId: status.deviceId };
    }
    if (status.status === "expired") return { status: "expired" };
    onTick?.(Math.max(0, Math.round((session.expiresAt - Date.now()) / 1000)));
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return { status: "expired" };
}
