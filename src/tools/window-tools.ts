// Presence Desktop Agent — Fase 10E: janelas.
//
// `node-window-manager` só suporta oficialmente Windows e macOS — o
// próprio pacote marca Linux como "(WIP)"/riscado no README. Isto NÃO
// pode ser validado de ponta a ponta neste sandbox Linux; implementado
// contra a API documentada, revisão de código só. `close_window` usa
// `riskTier: "destructive"` de propósito (não existe um `close()` na
// API — fechar de verdade significa encerrar o processo, o que pode
// perder trabalho não salvo) e por isso nunca é chamado pelo
// resolvedor determinístico desta fatia — fica registrado, pronto
// pra quando o Permission Manager (Fase 10F) existir de verdade.

import { windowManager } from "node-window-manager";

import { registerTool } from "./registry";

export interface WindowInfo {
  id: number;
  title: string;
  processId: number;
}

function listWindows(): WindowInfo[] {
  return windowManager
    .getWindows()
    .filter((window) => window.isVisible())
    .map((window) => ({ id: window.id, title: window.getTitle(), processId: window.processId }));
}

function focusWindow(args: { windowId: number }): { focused: boolean } {
  const target = windowManager.getWindows().find((window) => window.id === args.windowId);
  if (!target) return { focused: false };
  target.restore();
  target.bringToTop();
  return { focused: true };
}

function closeWindowByProcess(args: { processId: number }): Promise<{ closed: boolean }> {
  return new Promise((resolve) => {
    try {
      process.kill(args.processId);
      resolve({ closed: true });
    } catch {
      resolve({ closed: false });
    }
  });
}

registerTool({
  name: "list_windows",
  riskTier: "read_only",
  description: "Lista as janelas visíveis abertas no computador.",
  run: () => Promise.resolve(listWindows()),
});

registerTool({
  name: "focus_window",
  riskTier: "reversible",
  description: "Traz uma janela existente pra frente.",
  run: (args: { windowId: number }) => Promise.resolve(focusWindow(args)),
});

registerTool({
  name: "close_window",
  riskTier: "destructive",
  description: "Encerra o processo dono de uma janela — pode perder trabalho não salvo.",
  run: (args: { processId: number }) => closeWindowByProcess(args),
});
