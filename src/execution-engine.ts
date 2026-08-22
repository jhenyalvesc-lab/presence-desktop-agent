// Presence Desktop Agent — Fase 10F: Execution Engine.
//
// Único caminho pra rodar uma ferramenta do Tool Registry de verdade —
// passa pelo Permission Manager antes (nunca pula confirmação quando
// ela é exigida) e grava tudo no Audit Log local (`audit-log.ts`),
// sucesso ou falha. `command-resolver.ts` e qualquer fase futura que
// invoque uma ferramenta devem passar por aqui, nunca chamar
// `tool.run()` diretamente.

import { logAuditEntry } from "./audit-log";
import { requestConfirmation } from "./confirmation-broker";
import { requiresConfirmation } from "./permission-manager";
import { getTool } from "./tools/registry";

export type ExecutionOutcome =
  | { ok: true; result: unknown }
  | { ok: false; reason: "not_found" | "denied" | "error"; detail?: string };

export async function executeTool(name: string, args: unknown): Promise<ExecutionOutcome> {
  const tool = getTool(name);
  if (!tool) {
    logAuditEntry({ tool: name, args, riskTier: "unknown", confirmation: "not_required", outcome: "not_found" });
    return { ok: false, reason: "not_found" };
  }

  const mustConfirm = requiresConfirmation(tool.riskTier);
  if (mustConfirm) {
    const approved = await requestConfirmation(tool.name, tool.description, tool.riskTier);
    if (!approved) {
      logAuditEntry({ tool: name, args, riskTier: tool.riskTier, confirmation: "user_denied", outcome: "denied" });
      return { ok: false, reason: "denied" };
    }
  }

  try {
    const result = await tool.run(args);
    logAuditEntry({
      tool: name,
      args,
      riskTier: tool.riskTier,
      confirmation: mustConfirm ? "user_confirmed" : "not_required",
      outcome: "success",
    });
    return { ok: true, result };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logAuditEntry({
      tool: name,
      args,
      riskTier: tool.riskTier,
      confirmation: mustConfirm ? "user_confirmed" : "not_required",
      outcome: "error",
      detail,
    });
    return { ok: false, reason: "error", detail };
  }
}
