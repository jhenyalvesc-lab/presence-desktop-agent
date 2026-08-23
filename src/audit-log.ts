// Presence Desktop Agent — Fase 10F: log de auditoria LOCAL + (Fase 10,
// roteiro original "Fase I") sincronização best-effort pra nuvem.
//
// A arquitetura aprovada previa um log de auditoria completo na nuvem
// (`agent_audit_log`, seção "Contrato de nuvem" do documento) — nesta
// fatia o lado de nuvem já existe (`POST /api/presence/agent/audit`,
// repositório principal), então cada entrada é sincronizada também pra
// lá. O arquivo JSONL local + buffer em memória continuam sendo a
// FONTE DE VERDADE: a sincronização é best-effort e nunca bloqueia nem
// derruba a execução real da ferramenta (sem pareamento, sem rede,
// erro do servidor — qualquer falha aqui é só ignorada).

import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

import { sendAuditEntry } from "./cloud-client";

export type ConfirmationOutcome = "not_required" | "auto" | "user_confirmed" | "user_denied";
export type ExecutionOutcome = "success" | "denied" | "error" | "not_found";

export interface AuditEntry {
  at: string;
  tool: string;
  args: unknown;
  riskTier: string;
  confirmation: ConfirmationOutcome;
  outcome: ExecutionOutcome;
  detail?: string;
}

type Listener = (entry: AuditEntry) => void;

const MAX_IN_MEMORY = 200;
const entries: AuditEntry[] = [];
const listeners = new Set<Listener>();

function logFilePath(): string {
  return path.join(app.getPath("userData"), "audit-log.jsonl");
}

export function logAuditEntry(partial: Omit<AuditEntry, "at">): void {
  const entry: AuditEntry = { at: new Date().toISOString(), ...partial };
  entries.push(entry);
  if (entries.length > MAX_IN_MEMORY) entries.shift();

  try {
    fs.appendFileSync(logFilePath(), `${JSON.stringify(entry)}\n`);
  } catch {
    // Best-effort — um log que falha em gravar nunca deve derrubar a execução da ferramenta.
  }

  // Best-effort pra nuvem — mesmo princípio acima: sem pareamento, sem
  // rede ou erro do servidor nunca derruba a execução real da
  // ferramenta nem o log local (que já aconteceu antes desta linha).
  void sendAuditEntry({
    tool: entry.tool,
    args: entry.args,
    riskTier: entry.riskTier,
    confirmationOutcome: entry.confirmation,
    outcome: entry.outcome,
    detail: entry.detail,
  }).catch(() => undefined);

  for (const listener of listeners) listener(entry);
}

export function getRecentAuditEntries(limit = 20): AuditEntry[] {
  return entries.slice(-limit);
}

export function onAuditEntry(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
