// Presence Desktop Agent — Fase 10H: inspeção do Claude Code (Nível 0,
// leitura, 100% determinístico onde é possível ser determinístico).
//
// Duas partes bem diferentes em confiabilidade:
//
// 1. `claude_code_process_status` — checar se existe um processo do
//    Claude Code rodando é só filtrar `list_processes` (Fase 10E) por
//    nome. **Real ambiguidade não resolvida**: o nome exato do
//    processo do Claude Code no Windows da Jheny não é algo que este
//    código possa saber de antemão (pode rodar como `claude.exe`,
//    `node.exe`, dentro de um terminal, etc.) — o padrão é
//    configurável (`PRESENCE_CLAUDE_CODE_PROCESS_PATTERN`, um regex),
//    com um valor padrão razoável, mas não uma certeza.
//
// 2. `claude_code_confirmation_check` — "o Claude está esperando
//    confirmação?". A arquitetura aprovada já é explícita sobre isto:
//    "não existe uma API genérica pra ler o que está escrito num
//    terminal arbitrário... vai precisar, no mínimo, de heurísticas
//    regex sobre padrões conhecidos de prompt, com risco real de falso
//    negativo em padrões novos". Isto NÃO é uma capacidade resolvida —
//    é uma tentativa best-effort: encontra uma janela cujo título bate
//    com um padrão, tira um screenshot, roda OCR (Fase 10E) nele, e
//    testa o texto contra os padrões de prompt de confirmação que o
//    próprio Claude Code CLI realmente usa (`❯ 1. Yes` / `(y/n)` /
//    "Do you want to proceed?" / "Press Enter to continue"). Cada
//    etapa dessa cadeia (achar a janela certa, tirar um screenshot que
//    realmente mostra o terminal, OCR sem erro) pode falhar
//    silenciosamente — por isso o resultado é sempre rotulado como
//    heurística, nunca como certeza.

import { listProcesses } from "./process-tools";
import { ocrScreen } from "./ocr-tools";
import { registerTool } from "./registry";
import { listWindows } from "./window-tools";

const DEFAULT_PROCESS_PATTERN = "claude";
const DEFAULT_WINDOW_PATTERN = "claude";

const CONFIRMATION_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "numbered-yes-no", pattern: /❯?\s*1\.\s*yes/i },
  { label: "do-you-want-to-proceed", pattern: /do you want to (proceed|continue)/i },
  { label: "y-n-prompt", pattern: /\(y\s*\/\s*n\)/i },
  { label: "press-enter", pattern: /press enter to continue/i },
];

export interface ConfirmationHeuristicResult {
  matched: boolean;
  pattern?: string;
}

/** Só a lógica de correspondência, pura e testável sem tela/OCR nenhum. */
export function checkConfirmationHeuristic(text: string): ConfirmationHeuristicResult {
  for (const { label, pattern } of CONFIRMATION_PATTERNS) {
    if (pattern.test(text)) return { matched: true, pattern: label };
  }
  return { matched: false };
}

async function claudeCodeProcessStatus(): Promise<{ running: boolean; matches: { pid: number; name: string }[] }> {
  const rawPattern = process.env["PRESENCE_CLAUDE_CODE_PROCESS_PATTERN"] ?? DEFAULT_PROCESS_PATTERN;
  const pattern = new RegExp(rawPattern, "i");
  const processes = await listProcesses();
  const matches = processes.filter((entry) => pattern.test(entry.name));
  return { running: matches.length > 0, matches };
}

async function claudeCodeConfirmationCheck(): Promise<{
  windowFound: boolean;
  heuristic: ConfirmationHeuristicResult | null;
}> {
  const rawPattern = process.env["PRESENCE_CLAUDE_CODE_WINDOW_PATTERN"] ?? DEFAULT_WINDOW_PATTERN;
  const pattern = new RegExp(rawPattern, "i");
  const window = listWindows().find((candidate) => pattern.test(candidate.title));
  if (!window) return { windowFound: false, heuristic: null };

  const { text } = await ocrScreen();
  return { windowFound: true, heuristic: checkConfirmationHeuristic(text) };
}

registerTool({
  name: "claude_code_process_status",
  riskTier: "read_only",
  description: "Verifica se existe um processo do Claude Code em execução.",
  run: () => claudeCodeProcessStatus(),
});

registerTool({
  name: "claude_code_confirmation_check",
  riskTier: "read_only",
  description: "Tenta detectar (heurística, não garantida) se o Claude Code está esperando confirmação numa janela visível.",
  run: () => claudeCodeConfirmationCheck(),
});
