// Presence Desktop Agent — Main Process.
//
// Fase A (aprovada): Main Process, Tray, autostart, janela que esconde
// em vez de fechar, pareamento com o backend cloud e um ping de prova.
// Fase 10B: Audio Worker com Wake Word ("acordar", português). Fase 10C: duas
// palmas, sobre o mesmo Audio Worker. Fase 10D: captura do comando
// falado (STT) depois do gatilho. Fase 10E: Tool Registry + resolução
// determinística de "abre X". Fase 10F: Permission Manager + Execution
// Engine + confirmação + Audit Log local. Fase 10G: Scheduler +
// Notification Manager. WhatsApp, Claude Code e o restante do roteiro
// (ver IMPLEMENTATION_STATE.md do repositório principal) ficam para
// fases futuras.

import { app, ipcMain } from "electron";

import "./tools";

import { getAudioStatus, onAudioStatus, onClapDetected, onWakeDetected, startAudioWorker, stopAudioWorker } from "./audio-manager";
import { getRecentAuditEntries, onAuditEntry } from "./audit-log";
import { checkForUpdatesNow, initAutoUpdater, isUpdateReady } from "./auto-updater";
import { setAutostart } from "./autostart";
import { pingCloud } from "./cloud-client";
import { onCommandCompleted, onCommandQueueStatus, onCommandReceived, startCommandQueuePolling, stopCommandQueuePolling } from "./command-queue";
import { onConfirmationRequested, respondToConfirmation } from "./confirmation-broker";
import { loadDeviceCredential } from "./device-store";
import { executeTool } from "./execution-engine";
import { beginPairing, waitForApproval, type PairingOutcome } from "./pairing";
import { getJobStatuses, onJobStatusChanged, scheduleJob } from "./scheduler";
import { notifySpeechAudioEnded, onSpeechAudioReady } from "./speech-output";
import { createTray } from "./tray";
import { onCommandCaptured, onCommandResolution, onPlannerResolution, onVoiceInteractionState, startVoiceInteractionListener } from "./voice-interaction";
import {
  getWhatsAppConnectionStatus,
  hideWhatsAppWindow,
  onWhatsAppStatusChanged,
  showWhatsAppWindow,
  startWhatsAppStatusWatcher,
  stopWhatsAppStatusWatcher,
} from "./whatsapp-window";
import { createMainWindow, getMainWindow, showMainWindow } from "./window";

let pairingInFlight = false;

const HEALTHCHECK_CRON = process.env["PRESENCE_HEALTHCHECK_CRON"] ?? "*/15 * * * *";
const COMMAND_POLL_INTERVAL_MS = Number(process.env["PRESENCE_COMMAND_POLL_INTERVAL_MS"] ?? "4000");
const UPDATE_CHECK_CRON = process.env["PRESENCE_UPDATE_CHECK_CRON"] ?? "0 */6 * * *";

void app.whenReady().then(() => {
  createMainWindow();
  createTray();
  startAudioWorker();
  startVoiceInteractionListener();
  startCommandQueuePolling(COMMAND_POLL_INTERVAL_MS);
  // Checagem inicial acontece dentro de initAutoUpdater(); o job agendado
  // aqui só cobre o processo que fica rodando em segundo plano por dias
  // (mesmo padrão de reaproveitar o Scheduler já existente, como o
  // cloud-healthcheck logo abaixo).
  initAutoUpdater();
  scheduleJob("check-for-updates", UPDATE_CHECK_CRON, () => checkForUpdatesNow());

  onAudioStatus((status) => getMainWindow()?.webContents.send("agent:audio-status", status));
  onWakeDetected((event) => getMainWindow()?.webContents.send("agent:wake-detected", event));
  onClapDetected((event) => getMainWindow()?.webContents.send("agent:clap-detected", event));
  onVoiceInteractionState((state) => getMainWindow()?.webContents.send("agent:voice-state", state));
  onCommandCaptured((event) => getMainWindow()?.webContents.send("agent:command-captured", event));
  onCommandResolution((resolution) => getMainWindow()?.webContents.send("agent:command-resolved", resolution));
  onPlannerResolution((resolution) => getMainWindow()?.webContents.send("agent:planner-resolved", resolution));
  // Não existe API de áudio no Main Process — o Renderer é quem toca de
  // verdade (ver renderer/renderer.js), este só encaminha os bytes.
  onSpeechAudioReady((base64Mp3) => getMainWindow()?.webContents.send("agent:speech-audio", base64Mp3));

  onCommandQueueStatus((status, detail) => getMainWindow()?.webContents.send("agent:command-queue-status", { status, detail }));
  onCommandReceived((event) => getMainWindow()?.webContents.send("agent:command-queue-received", event));
  onCommandCompleted((event) => getMainWindow()?.webContents.send("agent:command-queue-completed", event));

  onConfirmationRequested((request) => {
    showMainWindow(); // uma ação precisando de confirmação sempre traz a janela pra frente — nunca fica escondida esperando resposta
    getMainWindow()?.webContents.send("agent:confirmation-request", request);
  });
  onAuditEntry((entry) => getMainWindow()?.webContents.send("agent:audit-appended", entry));

  // Primeira automação real do Scheduler: prova o disparo local
  // reaproveitando o contrato de nuvem já existente (ping), sem
  // inventar um endpoint novo. Sincronizar calendário/lembretes reais
  // (Fase 9) exigiria um endpoint autenticado por dispositivo que
  // ainda não existe — sinalizado nos docs, não fabricado aqui.
  scheduleJob("cloud-healthcheck", HEALTHCHECK_CRON, async () => {
    try {
      await pingCloud();
    } catch (error) {
      await executeTool("show_notification", {
        title: "Presence Desktop Agent",
        body: "Não consegui falar com a nuvem do Presence agora.",
      });
      throw error;
    }
  });
  onJobStatusChanged((status) => getMainWindow()?.webContents.send("agent:scheduler-status", status));

  // WhatsApp (Fase J): observa transições de status pra avisar quando a
  // sessão cai — nunca tenta relogar sozinho (não há credencial que
  // este código possa usar), só notifica pra a própria pessoa escanear
  // o QR code de novo quando quiser.
  startWhatsAppStatusWatcher();
  onWhatsAppStatusChanged((status) => {
    getMainWindow()?.webContents.send("agent:whatsapp-status-changed", status);
    if (status === "disconnected") {
      void executeTool("show_notification", {
        title: "Presence — WhatsApp",
        body: "O WhatsApp desconectou. Abra a janela do WhatsApp pra escanear o QR code de novo.",
      });
    }
  });
});

app.on("before-quit", () => {
  stopAudioWorker();
  stopCommandQueuePolling();
  stopWhatsAppStatusWatcher();
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

ipcMain.handle("agent:get-version", () => ({
  version: app.getVersion(),
  packaged: app.isPackaged,
  updateReady: isUpdateReady(),
}));

ipcMain.handle("agent:check-for-updates", () => checkForUpdatesNow());

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

ipcMain.on("agent:confirmation-response", (_event, id: string, approved: boolean) => {
  respondToConfirmation(id, approved);
});

ipcMain.on("agent:speech-audio-ended", () => notifySpeechAudioEnded());

ipcMain.handle("agent:get-audit-log", () => getRecentAuditEntries());

ipcMain.handle("agent:get-scheduler-status", () => getJobStatuses());

// WhatsApp (roteiro original, "Fase J") — opt-in explícito, risco de
// ToS aceito conscientemente pela Jheny antes desta implementação.
ipcMain.handle("agent:whatsapp-show", () => showWhatsAppWindow());
ipcMain.handle("agent:whatsapp-hide", () => hideWhatsAppWindow());
ipcMain.handle("agent:whatsapp-status", () => getWhatsAppConnectionStatus());
