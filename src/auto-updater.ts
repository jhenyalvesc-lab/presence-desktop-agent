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

export function initAutoUpdater(): void {
  if (initialized) return;
  initialized = true;

  if (!app.isPackaged) {
    console.log("[auto-updater] app não empacotado (npm run start) — checagem de atualização desativada.");
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error) => {
    // Nunca notifica a usuária por uma falha de checagem (sem rede, por
    // exemplo, é o caso mais comum) — mesmo espírito de `pingCloud()`
    // silencioso em `cloud-client.ts`.
    console.error("[auto-updater] falha ao checar/baixar atualização", error);
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateReady = true;
    notifyUpdateReady(info.version);
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
