// Presence Desktop Agent — Fase 10E: resolução determinística de
// comando simples (sem IA).
//
// Só cobre "abre/abrir/abra <app>" contra o App Registry por
// enquanto — exatamente o caso que a arquitetura descreve como
// resolvível por correspondência de alias, sem LLM. Qualquer coisa
// que não bata cai fora sem tentar adivinhar; seleção de ferramenta
// por linguagem livre fica pra uma fase futura (planner).

import { resolveAppByAlias } from "./tools/app-registry";
import { getTool } from "./tools/registry";

export type CommandResolution =
  | { matched: false }
  | { matched: true; tool: string; label: string; ok: true; result: unknown }
  | { matched: true; tool: string; label: string; ok: false; error: string };

const OPEN_APP_PATTERN = /^\s*(?:abre|abrir|abra)\s+(?:o|a)?\s*(.+?)\s*$/i;

export async function resolveAndExecuteCommand(transcript: string): Promise<CommandResolution> {
  const match = transcript.match(OPEN_APP_PATTERN);
  if (!match) return { matched: false };

  const appQuery = match[1] ?? "";
  const app = resolveAppByAlias(appQuery);
  if (!app) return { matched: false };

  const tool = getTool("open_app");
  if (!tool) return { matched: false };

  try {
    const result = await tool.run({ name: app.name });
    return { matched: true, tool: "open_app", label: app.displayName, ok: true, result };
  } catch (error) {
    return {
      matched: true,
      tool: "open_app",
      label: app.displayName,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
