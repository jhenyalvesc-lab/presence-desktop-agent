// Presence Desktop Agent — Fase 10E: Tool Registry.
//
// Única fonte de verdade de quais ferramentas existem e qual o nível
// de risco de cada uma (arquitetura aprovada: "o LLM nunca decide seu
// próprio nível de risco, só propõe qual ferramenta usar"). Registro
// simples em memória — sem persistência, reconstruído a cada início
// do Main Process.

import type { ToolDefinition } from "./types";

const tools = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  if (tools.has(tool.name)) {
    throw new Error(`presence-agent/tool-already-registered:${tool.name}`);
  }
  tools.set(tool.name, tool);
}

export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

export function listTools(): ToolDefinition[] {
  return Array.from(tools.values());
}
