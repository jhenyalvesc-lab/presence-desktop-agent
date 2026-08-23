// Presence Desktop Agent — Fase A: ícone na bandeja.
//
// Único jeito de encerrar o processo de verdade ("Encerrar") — fechar a
// janela principal nunca faz isso (ver window.ts).

import { app, Menu, nativeImage, Tray } from "electron";
import path from "node:path";

import { stopAudioWorker } from "./audio-manager";
import { isAutostartEnabled, setAutostart } from "./autostart";
import { showMainWindow } from "./window";
import { showWhatsAppWindow } from "./whatsapp-window";

let tray: Tray | null = null;

export function createTray(): Tray {
  if (tray) return tray;

  const icon = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "tray-icon.png"));
  tray = new Tray(icon);
  tray.setToolTip("Presence Desktop Agent");
  tray.on("click", () => showMainWindow());
  refreshTrayMenu();

  return tray;
}

function refreshTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir Presence Desktop Agent", click: () => showMainWindow() },
      { type: "separator" },
      {
        label: "Iniciar com o Windows",
        type: "checkbox",
        checked: isAutostartEnabled(),
        click: (menuItem) => {
          setAutostart(menuItem.checked);
          refreshTrayMenu();
        },
      },
      { type: "separator" },
      {
        label: "Conectar WhatsApp (opt-in, risco de ToS)",
        click: () => showWhatsAppWindow(),
      },
      { type: "separator" },
      {
        label: "Encerrar",
        click: () => {
          stopAudioWorker();
          app.exit(0);
        },
      },
    ]),
  );
}
