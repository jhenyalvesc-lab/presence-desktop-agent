// Presence Desktop Agent — Fase 10F: Permission Manager.
//
// Único lugar que decide se uma ferramenta pode rodar sozinha ou
// precisa de confirmação — o Tool Registry (`tools/registry.ts`) é a
// fonte de verdade do `riskTier`, mas quem aplica os 4 níveis é aqui
// (arquitetura aprovada: "o LLM nunca decide seu próprio nível de
// risco, só propõe qual ferramenta usar").
//
// Nível 0 (leitura) e Nível 1 (reversível): sempre executam sozinhos.
// Nível 2 (comunicação externa): configurável pela usuária — "auto" ou
// "sempre confirmar", padrão "confirmar" (nunca assume permissão
// implícita). Nível 3 (destrutivo): SEMPRE confirma — não é
// configurável, de propósito.

import type { RiskTier } from "./tools/types";

export type ExternalCommMode = "auto" | "confirm";

let externalCommMode: ExternalCommMode = "confirm";

export function setExternalCommMode(mode: ExternalCommMode): void {
  externalCommMode = mode;
}

export function getExternalCommMode(): ExternalCommMode {
  return externalCommMode;
}

export function requiresConfirmation(riskTier: RiskTier): boolean {
  switch (riskTier) {
    case "read_only":
    case "reversible":
      return false;
    case "external_comm":
      return externalCommMode === "confirm";
    case "destructive":
      return true;
  }
}
