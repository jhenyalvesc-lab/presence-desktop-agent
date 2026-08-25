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
// Só existe atualização pendente depois que auto-updater.ts confirma
// "update-downloaded" — nunca antes disso (evita mostrar um item que
// reiniciaria pra uma versão que ainda não terminou de baixar).
let pendingUpdateVersion: string | null = null;

export function createTray(): Tray {
  if (tray) return tray;

  const icon = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "tray-icon.png"));
  tray = new Tray(icon);
  tray.setToolTip("Presence Desktop Agent");
  tray.on("click", () => showMainWindow());
  refreshTrayMenu();

  return tray;
}

/** Chamado por auto-updater.ts quando uma atualização já foi baixada. */
export function notifyUpdateReady(version: string): void {
  pendingUpdateVersion = version;
  refreshTrayMenu();
}

function refreshTrayMenu(): void {
  if (!tray) return;
  // Importado aqui (não no topo) pra evitar ciclo de módulo com
  // auto-updater.ts, que já importa deste arquivo.
  const { quitAndInstallUpdate } = require("./auto-updater") as typeof import("./auto-updater");

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
      ...(pendingUpdateVersion
        ? [
            { type: "separator" as const },
            {
              label: `Reiniciar e atualizar (versão ${pendingUpdateVersion})`,
              click: () => quitAndInstallUpdate(),
            },
          ]
        : []),
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
