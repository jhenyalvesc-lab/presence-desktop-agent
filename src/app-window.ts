// Presence Desktop Agent — janela da interface completa do Presence.
//
// Ao acordar (duas palmas/wake word), a Jheny pediu pra abrir a
// interface visual de verdade — o orbe, Treinos, Casa, tudo — não só
// escutar um comando escondido (o que já existia antes, via
// `stt-window.ts`). Carrega o site publicado de verdade (`CLOUD_BASE_URL`)
// numa janela própria do app: sempre a versão mais atual, sem duplicar
// nenhuma interface aqui — qualquer mudança publicada no site aparece
// aqui automaticamente na próxima vez que a janela abrir.
//
// Reaproveitada entre chamadas (nunca recriada) — só mostra/foca se já
// existir, mesmo espírito de `window.ts`.

import { BrowserWindow } from "electron";

import { CLOUD_BASE_URL } from "./config";

let appWindow: BrowserWindow | null = null;

export function showPresenceAppWindow(): void {
  if (appWindow) {
    appWindow.show();
    appWindow.focus();
    return;
  }

  appWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 560,
    title: "Presence",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void appWindow.loadURL(CLOUD_BASE_URL);

  appWindow.on("closed", () => {
    appWindow = null;
  });
}
