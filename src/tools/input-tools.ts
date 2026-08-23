// Presence Desktop Agent — Fase 10E: abrir app (Nível 1) + mouse/teclado
// (Nível 1) — controle do computador, sem IA.
//
// Mouse/teclado via `@nut-tree-fork/nut-js` — o fork ativamente
// mantido do antigo `@nut-tree/nut-js` (a arquitetura original citava
// esse nome; o pacote original não existe mais no npm, `404` confirmado
// nesta implementação — o projeto migrou pra este fork sob nova
// manutenção). Usa `libnut` internamente, um módulo N-API — ao
// contrário do `node-window-manager`, N-API é estável entre versões de
// Node/Electron e não deveria precisar de rebuild específico pro
// Electron.

import { spawn } from "node:child_process";

import { Button, keyboard, mouse, Point } from "@nut-tree-fork/nut-js";

import { loadAppRegistry } from "./app-registry";
import { registerTool } from "./registry";

function openApp(args: { name: string }): Promise<{ opened: true; pid?: number }> {
  const entry = loadAppRegistry().find((candidate) => candidate.name === args.name);
  // Achado real (validação em máquina de usuária): antes, um app não
  // cadastrado devolvia `{ opened: false }` sem lançar erro — o
  // Execution Engine só volta `ok: false` quando a ferramenta REJEITA,
  // então esse "falso sucesso silencioso" subia como `ok: true` até o
  // comando aparecer "concluído" na fila mesmo sem abrir nada. Rejeitar
  // aqui é o que faz a falha real aparecer como falha real.
  if (!entry) return Promise.reject(new Error(`app "${args.name}" não está cadastrado no App Registry`));

  const child = spawn(entry.executablePath, entry.args ?? [], { detached: true, stdio: "ignore" });
  child.unref();
  return Promise.resolve({ opened: true, pid: child.pid });
}

async function moveMouse(args: { x: number; y: number }): Promise<{ moved: boolean }> {
  await mouse.setPosition(new Point(args.x, args.y));
  return { moved: true };
}

async function click(args: { button?: "left" | "right" }): Promise<{ clicked: boolean }> {
  await mouse.click(args.button === "right" ? Button.RIGHT : Button.LEFT);
  return { clicked: true };
}

async function typeText(args: { text: string }): Promise<{ typed: boolean }> {
  await keyboard.type(args.text);
  return { typed: true };
}

registerTool({
  name: "open_app",
  riskTier: "reversible",
  description: "Abre um aplicativo cadastrado no App Registry.",
  run: (args: { name: string }) => openApp(args),
});

registerTool({
  name: "move_mouse",
  riskTier: "reversible",
  description: "Move o cursor do mouse para uma posição da tela.",
  run: (args: { x: number; y: number }) => moveMouse(args),
});

registerTool({
  name: "click_mouse",
  riskTier: "reversible",
  description: "Clica com o botão esquerdo ou direito do mouse na posição atual do cursor.",
  run: (args: { button?: "left" | "right" }) => click(args),
});

registerTool({
  name: "type_text",
  riskTier: "reversible",
  description: "Digita um texto via teclado, no campo com foco atual.",
  run: (args: { text: string }) => typeText(args),
});
