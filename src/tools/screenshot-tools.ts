// Presence Desktop Agent — Fase 10E: captura de tela (Nível 1, sem IA).
//
// `withTimeout` existe por causa de um achado real desta implementação:
// `screenshot-desktop` TRAVA (nunca resolve nem rejeita) neste sandbox
// quando falta uma ferramenta de X11 que ele depende (`xrandr`) — em
// vez de falhar rápido. Ver `timeout.ts`.

import screenshot from "screenshot-desktop";
import { app } from "electron";
import path from "node:path";

import { registerTool } from "./registry";
import { withTimeout } from "./timeout";

const SCREENSHOT_TIMEOUT_MS = 10_000;

async function takeScreenshot(): Promise<{ filePath: string }> {
  const filePath = path.join(app.getPath("temp"), `presence-screenshot-${Date.now()}.png`);
  await withTimeout(screenshot({ filename: filePath }), SCREENSHOT_TIMEOUT_MS, "take_screenshot");
  return { filePath };
}

registerTool({
  name: "take_screenshot",
  riskTier: "reversible",
  description: "Captura a tela atual e salva como PNG num arquivo temporário.",
  run: () => takeScreenshot(),
});
