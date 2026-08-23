// Presence Desktop Agent — WhatsApp (roteiro original, "Fase J") —
// WhatsApp Renderer: ciclo de vida da janela, sessão e reconexão.
//
// Risco real, aceito conscientemente pela Jheny (opt-in explícito via
// pergunta direta, não implementado silenciosamente mesmo sob a
// instrução de implementação sequencial): não existe caminho local puro
// nem API oficial que sirva pro caso de uso (ler/buscar/enviar
// mensagens e grupos PESSOAIS) — a WhatsApp Business Platform API exige
// verificação de negócio e número dedicado, pensada pra empresa↔cliente,
// não pra espelhar DMs/grupos pessoais. O único caminho tecnicamente
// viável (já identificado na arquitetura aprovada) é dirigir uma sessão
// real do WhatsApp Web — o que viola os Termos de Serviço do WhatsApp
// (automação não-oficial) e carrega risco real de banimento da conta.
//
// `BrowserWindow` oculta DEDICADA e ISOLADA de propósito (mesma
// arquitetura aprovada pro STT Renderer, `stt-window.ts`): se esta parte
// quebrar (mudança de layout da Meta, sessão expirada, timeout, crash
// do processo de renderização) ou até travar, nunca derruba wake
// word/controle/scheduler/fila de comandos/planner — todos módulos
// independentes.
//
// Sessão persistente via partition dedicada (`persist:whatsapp`) — o
// próprio WhatsApp Web guarda a sessão de login (localStorage/IndexedDB)
// nesse perfil isolado do Electron; este código nunca lê nem guarda
// nenhuma credencial por conta própria. Login inicial exige escanear um
// QR code com o celular — a janela precisa ficar visível uma vez pra
// isso (`showWhatsAppWindow()`), podendo voltar a ficar oculta depois.

import { BrowserWindow } from "electron";

const WHATSAPP_URL = "https://web.whatsapp.com";
const PARTITION = "persist:whatsapp";

// Reconexão com backoff — nunca insiste indefinidamente rápido (evita
// martelar uma rede fora do ar ou uma sessão banida em loop apertado).
const RELOAD_BACKOFF_MS = [5000, 10000, 20000, 40000, 60000];

let whatsappWindow: BrowserWindow | null = null;
let reloadAttempt = 0;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;

export type WhatsAppConnectionStatus =
  | "not_started"
  | "connecting"
  | "awaiting_qr_scan"
  | "connected"
  | "disconnected"
  | "unknown";

type StatusListener = (status: WhatsAppConnectionStatus) => void;
const statusListeners = new Set<StatusListener>();

export function onWhatsAppStatusChanged(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function scheduleReload(window: BrowserWindow): void {
  if (reloadTimer) return; // já tem uma tentativa agendada — não empilha
  const delay = RELOAD_BACKOFF_MS[Math.min(reloadAttempt, RELOAD_BACKOFF_MS.length - 1)];
  reloadAttempt += 1;
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    if (whatsappWindow === window && !window.isDestroyed()) {
      void window.loadURL(WHATSAPP_URL);
    }
  }, delay);
}

export function getWhatsAppWindow(): BrowserWindow {
  if (whatsappWindow) return whatsappWindow;

  const window = new BrowserWindow({
    show: false,
    width: 480,
    height: 640,
    title: "Presence — WhatsApp",
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void window.loadURL(WHATSAPP_URL);

  // Mesmo princípio de `window.ts`: fechar não encerra nada, só esconde.
  window.on("close", (event) => {
    event.preventDefault();
    window.hide();
  });

  // Reconexão segura: uma falha de carregamento ou crash do processo de
  // renderização nunca deixa a janela morta pra sempre — tenta de novo
  // com backoff crescente. A sessão em si (localStorage/IndexedDB do
  // WhatsApp Web) mora na partition, não na janela — recriar/recarregar
  // a janela não perde login já feito.
  window.webContents.on("did-fail-load", (_event, _errorCode, _errorDescription, _validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    scheduleReload(window);
  });

  window.webContents.on("render-process-gone", () => {
    if (whatsappWindow === window) {
      whatsappWindow = null; // a instância morreu de verdade — a próxima chamada recria do zero
    }
  });

  window.webContents.on("did-finish-load", () => {
    reloadAttempt = 0; // carregou com sucesso — reseta o backoff
  });

  whatsappWindow = window;
  return window;
}

export function showWhatsAppWindow(): void {
  const window = getWhatsAppWindow();
  window.show();
  window.focus();
}

export function hideWhatsAppWindow(): void {
  whatsappWindow?.hide();
}

/**
 * Heurística best-effort, dependente do DOM real do WhatsApp Web —
 * mesma honestidade já usada em `claude_code_confirmation_check` (Fase
 * 10H): a Meta pode mudar esses seletores a qualquer momento sem
 * aviso, quebrando esta detecção sem quebrar o WhatsApp Web em si.
 * **Nunca testado contra uma sessão real** — este sandbox não alcança
 * `web.whatsapp.com` (mesma limitação de rede de sempre) nem tem uma
 * conta de WhatsApp pra escanear um QR code de verdade. Só a mecânica
 * (`executeJavaScript` contra uma página que falhou ao carregar,
 * nunca travando/lançando) foi validada.
 */
export async function getWhatsAppConnectionStatus(): Promise<WhatsAppConnectionStatus> {
  if (!whatsappWindow) return "not_started";
  if (whatsappWindow.webContents.isLoading()) return "connecting";

  try {
    const result: unknown = await whatsappWindow.webContents.executeJavaScript(`
      (function () {
        if (document.querySelector('canvas[aria-label], div[data-testid="qrcode"]')) return "awaiting_qr_scan";
        if (document.querySelector('div[data-testid="chat-list"], div#pane-side')) return "connected";
        return "unknown";
      })();
    `);
    if (result === "awaiting_qr_scan" || result === "connected") return result;
    return "unknown";
  } catch {
    return "unknown";
  }
}

let watcherTimer: ReturnType<typeof setInterval> | null = null;
let lastKnownStatus: WhatsAppConnectionStatus = "not_started";

/**
 * Observa transições de status (ex. "connected" → "awaiting_qr_scan",
 * uma sessão que caiu) pra poder notificar quem estiver ouvindo (Main
 * Process manda uma notificação local via `show_notification`, nunca
 * tenta relogar sozinho — não há credencial nenhuma que este código
 * possa usar pra isso, só a própria pessoa escaneando o QR code de
 * novo resolve). Só roda depois que a janela existe — não fica
 * verificando status sem necessidade se a Jheny nunca conectou.
 */
export function startWhatsAppStatusWatcher(intervalMs = 15000): void {
  if (watcherTimer) return;
  watcherTimer = setInterval(() => {
    if (!whatsappWindow) return;
    void getWhatsAppConnectionStatus().then((status) => {
      const effective = status === "unknown" && lastKnownStatus === "connected" ? "disconnected" : status;
      if (effective === lastKnownStatus) return;
      lastKnownStatus = effective;
      for (const listener of statusListeners) listener(effective);
    });
  }, intervalMs);
}

export function stopWhatsAppStatusWatcher(): void {
  if (!watcherTimer) return;
  clearInterval(watcherTimer);
  watcherTimer = null;
}
