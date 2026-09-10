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
//
// Correção estrutural (reportado pela Jheny, 2026-09-10: "tudo que é
// atualizado no site nunca é atualizado no Presence Desktop") — a
// promessa do comentário acima ("sempre a versão mais atual") nunca foi
// verdade na prática: o processo do app fica rodando em segundo plano
// por dias (fechar a janela só esconde, nunca mata o processo — ver
// window-all-closed em main.ts), então esta função quase sempre caía no
// branch "já existe" — mostra/foca a MESMA página carregada da primeira
// vez que o app abriu, sem nunca buscar a versão nova do site. Agora
// recarrega toda vez que a janela é trazida à frente — o mesmo efeito de
// apertar Ctrl+R, mas automático, sem a Jheny precisar lembrar disso a
// cada deploy.

import { BrowserWindow } from "electron";

import { CLOUD_BASE_URL } from "./config";

let appWindow: BrowserWindow | null = null;

export function showPresenceAppWindow(): void {
  if (appWindow) {
    // Só recarrega quando a janela estava escondida/minimizada — ela vem
    // de segundo plano, então buscar a versão nova agora é só um ganho,
    // nunca uma perda. Se já está visível (a usuária clicou de novo em
    // algo que chama esta função enquanto já está olhando pra ela, ex.:
    // wake word duplicado), nunca recarrega por cima — isso jogaria fora
    // o Voice Mode/conversa em andamento sem necessidade nenhuma.
    const wasHidden = !appWindow.isVisible() || appWindow.isMinimized();
    appWindow.show();
    appWindow.focus();
    if (wasHidden) void appWindow.loadURL(CLOUD_BASE_URL);
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

  // Electron bloqueia permissões de mídia (microfone) por padrão em
  // qualquer janela nova — sem isso, o Voice Mode do próprio site (que
  // usa a Web Speech API do navegador) nunca conseguiria capturar áudio
  // aqui dentro. Mesmo tratamento já usado em `stt-window.ts`, escopado
  // só a esta janela (por `webContents.id`).
  const window = appWindow;
  window.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === "media" && webContents.id === window.webContents.id);
  });

  // O Chromium guarda o nível de zoom por origem e reaplica sozinho na
  // próxima vez que a mesma URL carrega — sem isso, um pinch-zoom
  // acidental (trackpad) numa sessão fica valendo pra sempre nas
  // próximas aberturas do app (reportado pela Jheny: "já abre em 50%").
  // Trava em 100% sempre que a página termina de carregar, e desliga o
  // pinch-zoom (visual zoom) — ele só amplia pixels sem reajustar o
  // layout, o que deixa o orbe (WebGL) borrado/distorcido.
  window.webContents.on("did-finish-load", () => {
    window.webContents.setZoomFactor(1);
    window.webContents.setVisualZoomLevelLimits(1, 1);
  });

  void appWindow.loadURL(CLOUD_BASE_URL);

  appWindow.on("closed", () => {
    appWindow = null;
  });
}
