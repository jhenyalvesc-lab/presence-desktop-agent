// Presence Desktop Agent — Fase A: fundação + pareamento de dispositivo.
//
// Escopo desta fatia (aprovado explicitamente pela Jheny): só Main
// Process, Tray, autostart, janela que esconde em vez de fechar,
// pareamento com o backend cloud e um ping de prova. Wake word, duas
// palmas, controle do computador, WhatsApp, Claude Code e o restante do
// roteiro (ver IMPLEMENTATION_STATE.md do repositório principal) ficam
// para fases futuras, cada uma com sua própria aprovação.

import { app, ipcMain } from "electron";

import { setAutostart } from "./autostart";
import { pingCloud } from "./cloud-client";
import { loadDeviceCredential } from "./device-store";
import { beginPairing, waitForApproval, type PairingOutcome } from "./pairing";
import { createTray } from "./tray";
import { createMainWindow, getMainWindow } from "./window";

let pairingInFlight = false;

void app.whenReady().then(() => {
  createMainWindow();
  createTray();
});

// Fechar a janela nunca encerra o agente (ver window.ts); no Windows,
// "todas as janelas fechadas" também não deve encerrar o processo — só a
// bandeja ("Encerrar") faz isso de verdade.
app.on("window-all-closed", () => {
  // intencionalmente vazio — o agente continua rodando em segundo plano.
});

ipcMain.handle("agent:get-status", async () => {
  const credential = await loadDeviceCredential();
  return { paired: credential !== null, deviceId: credential?.deviceId ?? null };
});

ipcMain.handle("agent:start-pairing", async (): Promise<PairingOutcome> => {
  if (pairingInFlight) throw new Error("presence-agent/pairing-already-in-progress");
  pairingInFlight = true;
  try {
    const session = await beginPairing();
    const window = getMainWindow();
    window?.webContents.send("agent:pairing-started", { code: session.code });
    return await waitForApproval(session, (secondsLeft) => {
      window?.webContents.send("agent:pairing-tick", secondsLeft);
    });
  } finally {
    pairingInFlight = false;
  }
});

ipcMain.handle("agent:ping", () => pingCloud());

ipcMain.handle("agent:set-autostart", (_event, enabled: boolean) => {
  setAutostart(enabled);
  return { enabled };
});
