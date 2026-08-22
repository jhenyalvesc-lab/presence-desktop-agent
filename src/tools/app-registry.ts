// Presence Desktop Agent — Fase 10E: App Registry.
//
// Tabela local, específica da máquina (não vai pra nuvem — a
// arquitetura já previa isso: "nome/executablePath/aliases/processName
// não precisam ir pra nuvem"). Lê um JSON editável (`config/app-registry.json`,
// sobrescrevível via `PRESENCE_APP_REGISTRY_PATH`) — vem vazio por
// padrão. Nunca inventamos caminhos reais de aplicativos do computador
// da Jheny; ela precisa preencher esse arquivo com os apps dela.

import fs from "node:fs";
import path from "node:path";

export interface AppRegistryEntry {
  name: string;
  displayName: string;
  executablePath: string;
  args?: string[];
  aliases: string[];
}

const DEFAULT_REGISTRY_PATH = path.join(__dirname, "..", "..", "config", "app-registry.json");

function registryPath(): string {
  return process.env["PRESENCE_APP_REGISTRY_PATH"] ?? DEFAULT_REGISTRY_PATH;
}

export function loadAppRegistry(): AppRegistryEntry[] {
  const filePath = registryPath();
  if (!fs.existsSync(filePath)) return [];

  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as AppRegistryEntry[]) : [];
}

/** Resolve um app pelo que a pessoa disse ("abre o spotify") contra os aliases cadastrados — igualdade exata primeiro, substring como segunda tentativa. Nunca usa IA. */
export function resolveAppByAlias(query: string): AppRegistryEntry | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;

  const entries = loadAppRegistry();

  const exactMatch = entries.find((entry) => entry.aliases.some((alias) => alias.toLowerCase() === normalized));
  if (exactMatch) return exactMatch;

  const partialMatch = entries.find((entry) => entry.aliases.some((alias) => normalized.includes(alias.toLowerCase())));
  return partialMatch ?? null;
}
