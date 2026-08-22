// Presence Desktop Agent — Fase 10F: log de auditoria LOCAL.
//
// A arquitetura aprovada prevê um log de auditoria completo na nuvem
// (`agent_audit_log`, seção "Contrato de nuvem" do documento) — mas
// isso é escopo da Fase 10I ("Permissões + auditoria completa"), ainda
// não implementada. Esta fatia (10F) grava só um log LOCAL (arquivo
// JSONL no perfil do usuário + buffer em memória) — suficiente pra
// provar que toda execução passa por aqui, mas não substitui o log na
// nuvem que vem depois.

import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

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

  for (const listener of listeners) listener(entry);
}

export function getRecentAuditEntries(limit = 20): AuditEntry[] {
  return entries.slice(-limit);
}

export function onAuditEntry(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
