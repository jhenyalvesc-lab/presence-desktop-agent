// Presence Desktop Agent — WhatsApp (roteiro original, "Fase J") —
// WhatsApp Renderer.
//
// Risco real, aceito conscientemente pela Jheny (opt-in explícito via
// pergunta direta, não implementado silenciosamente mesmo sob a
// instrução de implementação sequencial): não existe caminho local puro
// nem API oficial que sirva pro caso de uso (ler/buscar/resumir
// mensagens e grupos PESSOAIS) — a WhatsApp Business Platform API exige
// verificação de negócio e número dedicado, pensada pra empresa↔cliente,
// não pra espelhar DMs/grupos pessoais. O único caminho tecnicamente
// viável (já identificado na arquitetura aprovada) é dirigir uma sessão
// real do WhatsApp Web — o que viola os Termos de Serviço do WhatsApp
// (automação não-oficial) e carrega risco real de banimento da conta.
//
// `BrowserWindow` oculta DEDICADA e ISOLADA de propósito (mesma
// arquitetura aprovada pro STT Renderer, `stt-window.ts`): se esta parte
// quebrar (mudança de layout da Meta, sessão expirada, timeout) ou até
// travar, nunca derruba wake word/controle/scheduler/fila de
// comandos/planner — todos módulos independentes.
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

let whatsappWindow: BrowserWindow | null = null;

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

export type WhatsAppConnectionStatus = "not_started" | "awaiting_qr_scan" | "connected" | "unknown";

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

  try {
    const result: unknown = await whatsappWindow.webContents.executeJavaScript(`
      (function () {
        if (document.querySelector('canvas[aria-label], div[data-testid="qrcode"]')) return "awaiting_qr_scan";
        if (document.querySelector('div[data-testid="chat-list"], div#pane-side')) return "connected";
        return "unknown";
      })();
    `);
    return result === "awaiting_qr_scan" || result === "connected" ? result : "unknown";
  } catch {
    return "unknown";
  }
}
