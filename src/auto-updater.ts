// Empacotamento/atualização automática (lacuna real do audit: "fica
// desatualizado no meu computador" — hoje só roda via `npm run start`
// a partir do código-fonte, sem instalador nem checagem de versão).
//
// `electron-updater` consulta os Releases do GitHub (mesmo repositório,
// via `publish` do `electron-builder` em package.json) — nenhum servidor
// de atualização novo, nenhuma credencial nova: os Releases são
// públicos, a checagem não precisa de `GITHUB_TOKEN`.
//
// Best-effort de propósito, mesmo princípio já usado em `speech-output.ts`/
// sincronização do Audit Log: uma falha ao checar/baixar atualização
// (sem rede, por exemplo) nunca derruba o agente — só fica silenciosa ou
// gera uma notificação, nunca uma exceção não tratada.
//
// Só roda quando empacotado (`app.isPackaged`) — em desenvolvimento
// (`npm run start`, direto do código-fonte) o electron-updater não tem
// um instalador local pra atualizar, então checar geraria só ruído/erro.

import { app } from "electron";
import { autoUpdater } from "electron-updater";

import { executeTool } from "./execution-engine";
import { notifyUpdateReady } from "./tray";

let initialized = false;
let updateReady = false;

export function isUpdateReady(): boolean {
  return updateReady;
}

export function quitAndInstallUpdate(): void {
  autoUpdater.quitAndInstall();
}

// A tela de status ("Versão", index.html) não tinha nenhuma visibilidade
// real do que acontece depois de clicar "Verificar atualização" — só
// mostrava "verificando..." e voltava pro número da versão atual,
// escondendo tanto sucesso silencioso (baixando em segundo plano) quanto
// falha silenciosa (sem rede, release sem asset compatível, etc.). Esses
// eventos existem no `autoUpdater` desde sempre — só nunca tinham um
// listener que os expusesse pra fora deste módulo.
export type UpdaterStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "not-available" }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string };

type StatusListener = (status: UpdaterStatus) => void;
const statusListeners = new Set<StatusListener>();
let lastStatus: UpdaterStatus = { state: "idle" };

export function onUpdaterStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function getUpdaterStatus(): UpdaterStatus {
  return lastStatus;
}

function setStatus(status: UpdaterStatus): void {
  lastStatus = status;
  for (const listener of statusListeners) listener(status);
}

export function initAutoUpdater(): void {
  if (initialized) return;
  initialized = true;

  if (!app.isPackaged) {
    console.log("[auto-updater] app não empacotado (npm run start) — checagem de atualização desativada.");
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => setStatus({ state: "checking" }));
  autoUpdater.on("update-available", (info) => setStatus({ state: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => setStatus({ state: "not-available" }));
  autoUpdater.on("download-progress", (progress) =>
    setStatus({ state: "downloading", percent: Math.round(progress.percent) }),
  );

  autoUpdater.on("error", (error) => {
    // Nunca deixa uma falha de checagem (sem rede, por exemplo) derrubar o
    // agente — mesmo espírito de `pingCloud()` em `cloud-client.ts`. Mas
    // agora, diferente de antes, a falha real fica visível na tela de
    // status (`setStatus` abaixo) em vez de só no console (invisível pra
    // quem não tem DevTools aberto num app empacotado).
    console.error("[auto-updater] falha ao checar/baixar atualização", error);
    setStatus({ state: "error", message: error.message });
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateReady = true;
    notifyUpdateReady(info.version);
    setStatus({ state: "downloaded", version: info.version });
    void executeTool("show_notification", {
      title: "Presence — atualização pronta",
      body: `Versão ${info.version} baixada. Reinicie pelo menu da bandeja (Encerrar → abrir de novo, ou "Reiniciar e atualizar") pra aplicar.`,
    }).catch(() => undefined);
  });

  void autoUpdater.checkForUpdates().catch((error) => {
    console.error("[auto-updater] checagem inicial falhou", error);
  });
}

export function checkForUpdatesNow(): Promise<void> {
  if (!app.isPackaged) return Promise.resolve();
  return autoUpdater
    .checkForUpdates()
    .then(() => undefined)
    .catch((error) => {
      console.error("[auto-updater] checagem manual falhou", error);
    });
}
