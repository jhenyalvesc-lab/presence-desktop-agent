// Presence Desktop Agent — Main Process.
//
// Fase A (aprovada): Main Process, Tray, autostart, janela que esconde
// em vez de fechar, pareamento com o backend cloud e um ping de prova.
// Fase 10B: Audio Worker com Wake Word ("Presence"). Fase 10C: duas
// palmas, sobre o mesmo Audio Worker. Fase 10D: captura do comando
// falado (STT) depois do gatilho. Fase 10E: Tool Registry + resolução
// determinística de "abre X". Permissões/confirmação (Fase 10F),
// WhatsApp, Claude Code e o restante do roteiro (ver
// IMPLEMENTATION_STATE.md do repositório principal) ficam para fases
// futuras.

import { app, ipcMain } from "electron";

import "./tools";

import { getAudioStatus, onAudioStatus, onClapDetected, onWakeDetected, startAudioWorker, stopAudioWorker } from "./audio-manager";
import { setAutostart } from "./autostart";
import { pingCloud } from "./cloud-client";
import { loadDeviceCredential } from "./device-store";
import { beginPairing, waitForApproval, type PairingOutcome } from "./pairing";
import { createTray } from "./tray";
import { onCommandCaptured, onCommandResolution, onVoiceInteractionState, startVoiceInteractionListener } from "./voice-interaction";
import { createMainWindow, getMainWindow } from "./window";

let pairingInFlight = false;

void app.whenReady().then(() => {
  createMainWindow();
  createTray();
  startAudioWorker();
  startVoiceInteractionListener();

  onAudioStatus((status) => getMainWindow()?.webContents.send("agent:audio-status", status));
  onWakeDetected((event) => getMainWindow()?.webContents.send("agent:wake-detected", event));
  onClapDetected((event) => getMainWindow()?.webContents.send("agent:clap-detected", event));
  onVoiceInteractionState((state) => getMainWindow()?.webContents.send("agent:voice-state", state));
  onCommandCaptured((event) => getMainWindow()?.webContents.send("agent:command-captured", event));
  onCommandResolution((resolution) => getMainWindow()?.webContents.send("agent:command-resolved", resolution));
});

app.on("before-quit", () => stopAudioWorker());

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

ipcMain.handle("agent:get-audio-status", () => getAudioStatus());

ipcMain.handle("agent:set-autostart", (_event, enabled: boolean) => {
  setAutostart(enabled);
  return { enabled };
});
