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
//
// Janela sem moldura por padrão (pedido explícito da Jheny, 2026-09-10:
// "não queria que ela aparecesse [a barra escura]... só se eu apertasse
// algum botão") — full screen imersivo, sem a barra de título nativa do
// Windows por cima. `frame` não pode ser alternado numa BrowserWindow já
// criada (limitação do Electron/Windows), então Esc alterna recriando a
// janela com `frame` ligado/desligado, preservando a URL atual.

import { BrowserWindow } from "electron";

import { CLOUD_BASE_URL } from "./config";

let appWindow: BrowserWindow | null = null;
let framed = false;

function attachWindowBehavior(win: BrowserWindow): void {
  // O menu padrão do Electron já é removido globalmente em main.ts
  // (`Menu.setApplicationMenu(null)`), mas isso só vale pra janelas
  // criadas DEPOIS dessa chamada — como esta janela é recriada em
  // tempo de execução (toggle do Esc), reforça aqui pra nunca depender
  // de ordem de inicialização.
  win.setMenu(null);

  // Electron bloqueia permissões de mídia (microfone) por padrão em
  // qualquer janela nova — sem isso, o Voice Mode do próprio site (que
  // usa a Web Speech API do navegador) nunca conseguiria capturar áudio
  // aqui dentro. Mesmo tratamento já usado em `stt-window.ts`, escopado
  // só a esta janela (por `webContents.id`).
  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === "media" && webContents.id === win.webContents.id);
  });

  // O Chromium guarda o nível de zoom por origem e reaplica sozinho na
  // próxima vez que a mesma URL carrega — sem isso, um pinch-zoom
  // acidental (trackpad) numa sessão fica valendo pra sempre nas
  // próximas aberturas do app (reportado pela Jheny: "já abre em 50%").
  // Trava em 100% sempre que a página termina de carregar, e desliga o
  // pinch-zoom (visual zoom) — ele só amplia pixels sem reajustar o
  // layout, o que deixa o orbe (WebGL) borrado/distorcido.
  win.webContents.on("did-finish-load", () => {
    win.webContents.setZoomFactor(1);
    win.webContents.setVisualZoomLevelLimits(1, 1);
  });

  // Esc alterna entre tela cheia sem moldura (padrão ao abrir) e janela
  // normal com os controles do Windows (minimizar/maximizar/fechar) —
  // pedido explícito da Jheny.
  win.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") toggleFrame();
  });

  win.on("closed", () => {
    if (appWindow === win) appWindow = null;
  });
}

function buildWindow(withFrame: boolean): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 560,
    title: "Presence",
    frame: withFrame,
    fullscreen: !withFrame,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  attachWindowBehavior(win);
  win.once("ready-to-show", () => win.show());
  return win;
}

function toggleFrame(): void {
  if (!appWindow) return;
  const url = appWindow.webContents.getURL() || CLOUD_BASE_URL;
  const previous = appWindow;
  framed = !framed;
  appWindow = buildWindow(framed);
  if (framed) appWindow.maximize();
  void appWindow.loadURL(url);
  previous.destroy();
}

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

  framed = false;
  appWindow = buildWindow(false);
  void appWindow.loadURL(CLOUD_BASE_URL);
}
