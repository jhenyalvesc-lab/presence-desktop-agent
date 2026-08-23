// Presence Desktop Agent — WhatsApp (roteiro original, "Fase J"):
// operações reais de leitura/busca/envio contra a sessão do WhatsApp
// Web, via `executeJavaScript` na janela dedicada (`whatsapp-window.ts`).
//
// **Aviso de honestidade, o mesmo já usado em `claude_code_confirmation_check`
// (Fase 10H) e em `getWhatsAppConnectionStatus`**: os seletores de DOM
// abaixo (`data-testid`, classes `message-in`/`message-out`, a caixa de
// composição) ainda são inferidos de padrões publicamente conhecidos —
// só a caixa de busca foi confirmada contra uma sessão real (inspecionada
// via DevTools numa validação real com a Jheny, 23/08/2026: é um
// `<input data-tab="3">`, não mais `div[contenteditable]` como o padrão
// histórico assumia — corrigido em `typeIntoField`/nos seletores de
// `searchChats`/`openChatInternal`). A Meta pode mudar esse DOM a
// qualquer momento sem aviso, e o resto (composição/envio/leitura de
// mensagens) segue não confirmado — pendência real, não escondida.
//
// Cada função devolve `{ ok: true, data }` ou `{ ok: false, error }` —
// nunca lança por causa de um seletor não bater; quem chama (as
// ferramentas em `tools/whatsapp-tools.ts`, e por baixo delas o
// Execution Engine/Planner) decide o que fazer com uma falha, sem
// precisar de try/catch pra um caso totalmente esperado nesta fase
// (DOM real ainda não validado).

import { withTimeout } from "./tools/timeout";
import { getWhatsAppWindow } from "./whatsapp-window";

export interface WhatsAppChatSummary {
  name: string;
  lastMessagePreview: string;
  unreadCount: number;
}

export interface WhatsAppMessage {
  fromMe: boolean;
  author: string | null;
  text: string;
  /** Texto cru mostrado na UI (ex. "14:32") — o WhatsApp Web não expõe um timestamp ISO real no DOM. */
  timeLabel: string | null;
}

export type WhatsAppActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const READY_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 250;
// Achado real descoberto durante a validação desta fase, mesma classe
// de problema já documentada em `tools/timeout.ts` (Fase 10E,
// `screenshot-desktop`): se uma navegação/reload da janela (mecanismo
// de reconexão de `whatsapp-window.ts`) acontece enquanto uma chamada
// `executeJavaScript` está em andamento, a promise pode nunca resolver
// nem rejeitar (o contexto de execução antigo é invalidado no meio do
// caminho). Por isso toda ação passa por um limite de tempo externo,
// um pouco maior que `READY_TIMEOUT_MS` — nunca trava a interação por
// voz/fila de comandos/planner inteira por causa de uma única ação.
const ACTION_TIMEOUT_MS = 20000;

// Helper injetado em toda ação: espera um elemento aparecer (poll
// simples, sem MutationObserver — mais simples de raciocinar e
// suficiente pro tempo de resposta do WhatsApp Web) e simula digitação
// de verdade num campo de texto.
//
// Achado real (validação em máquina de usuária, DevTools numa sessão
// conectada de verdade): a caixa de busca do WhatsApp Web/Business, que
// a arquitetura original assumia ser uma `div[contenteditable="true"]`
// (padrão histórico), hoje é um `<input>` de verdade (`role="textbox"`,
// `data-tab="3"`) — confirmado inspecionando o elemento real. Setar
// `.value` direto não dispara o `onInput` que o React precisa pra
// atualizar o estado; precisa do truque do setter nativo do protótipo +
// um evento "input" sintético. `typeIntoField` detecta o tipo do
// elemento e usa a técnica certa pra cada um, cobrindo tanto esse
// `<input>` real quanto qualquer `contenteditable` que ainda exista em
// outra parte da UI (ex. a caixa de composição de mensagem, ainda não
// confirmada da mesma forma).
const JS_HELPERS = `
  function waitFor(selector, timeoutMs) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function poll() {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        if (Date.now() - start > timeoutMs) return reject(new Error("timeout esperando " + selector));
        setTimeout(poll, ${POLL_INTERVAL_MS});
      })();
    });
  }
  function typeIntoField(el, text) {
    el.focus();
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      const proto = el.tagName === "INPUT" ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      document.execCommand("selectAll", false, null);
      document.execCommand("delete", false, null);
      document.execCommand("insertText", false, text);
    }
  }
`;

async function runInWhatsApp<T>(script: string): Promise<WhatsAppActionResult<T>> {
  const window = getWhatsAppWindow();
  try {
    const result = (await withTimeout(
      window.webContents.executeJavaScript(`
      (async function () {
        ${JS_HELPERS}
        try {
          ${script}
        } catch (error) {
          return { ok: false, error: String(error && error.message ? error.message : error) };
        }
      })();
    `),
      ACTION_TIMEOUT_MS,
      "whatsapp-action",
    )) as WhatsAppActionResult<T>;
    return result;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Lista as conversas visíveis na tela inicial (sem abrir nenhuma), mais recentes primeiro — ordem já dada pelo próprio WhatsApp Web. */
export async function listChats(limit = 20): Promise<WhatsAppActionResult<WhatsAppChatSummary[]>> {
  return runInWhatsApp<WhatsAppChatSummary[]>(`
    await waitFor('div[aria-label], div#pane-side', ${READY_TIMEOUT_MS});
    const rows = Array.from(document.querySelectorAll('div[role="listitem"], div[data-testid="cell-frame-container"]')).slice(0, ${limit});
    const chats = rows.map((row) => {
      const nameEl = row.querySelector('span[dir="auto"][title], span[title]');
      const previewEl = row.querySelector('span[dir="ltr"], div[data-testid="last-msg-status"] + span');
      const unreadEl = row.querySelector('span[aria-label*="unread" i], span[data-testid="icon-unread-count"]');
      return {
        name: nameEl ? nameEl.getAttribute('title') || nameEl.textContent || '' : '',
        lastMessagePreview: previewEl ? previewEl.textContent || '' : '',
        unreadCount: unreadEl ? parseInt(unreadEl.textContent || '0', 10) || 1 : 0,
      };
    }).filter((chat) => chat.name);
    return { ok: true, data: chats };
  `);
}

/** Busca conversas/contatos pelo nome — usa a própria busca do WhatsApp Web, depois lê a lista filtrada com a mesma lógica de `listChats`. */
export async function searchChats(query: string): Promise<WhatsAppActionResult<WhatsAppChatSummary[]>> {
  const escaped = JSON.stringify(query);
  return runInWhatsApp<WhatsAppChatSummary[]>(`
    const searchBox = await waitFor('input[data-tab="3"], div[contenteditable="true"][data-tab="3"], input[aria-label="Pesquisar ou começar uma nova conversa"]', ${READY_TIMEOUT_MS});
    typeIntoField(searchBox, ${escaped});
    await new Promise((r) => setTimeout(r, 600));
    const rows = Array.from(document.querySelectorAll('div[role="listitem"], div[data-testid="cell-frame-container"]'));
    const chats = rows.map((row) => {
      const nameEl = row.querySelector('span[dir="auto"][title], span[title]');
      const previewEl = row.querySelector('span[dir="ltr"]');
      return {
        name: nameEl ? nameEl.getAttribute('title') || nameEl.textContent || '' : '',
        lastMessagePreview: previewEl ? previewEl.textContent || '' : '',
        unreadCount: 0,
      };
    }).filter((chat) => chat.name);
    // limpa a busca pra deixar o WhatsApp Web num estado navegável de novo
    typeIntoField(searchBox, "");
    return { ok: true, data: chats };
  `);
}

/** Abre uma conversa pelo nome exato ou parcial (busca primeiro, clica no primeiro resultado). */
async function openChatInternal(chatName: string): Promise<WhatsAppActionResult<{ opened: boolean }>> {
  const escaped = JSON.stringify(chatName);
  return runInWhatsApp<{ opened: boolean }>(`
    const searchBox = await waitFor('input[data-tab="3"], div[contenteditable="true"][data-tab="3"], input[aria-label="Pesquisar ou começar uma nova conversa"]', ${READY_TIMEOUT_MS});
    typeIntoField(searchBox, ${escaped});
    await new Promise((r) => setTimeout(r, 600));
    const firstResult = document.querySelector('div[role="listitem"], div[data-testid="cell-frame-container"]');
    if (!firstResult) {
      typeIntoField(searchBox, "");
      return { ok: false, error: "nenhuma conversa encontrada pra \\"" + ${escaped} + "\\"" };
    }
    firstResult.click();
    await waitFor('div[data-testid="conversation-panel-messages"], div[data-testid="conversation-panel-wrapper"]', ${READY_TIMEOUT_MS});
    return { ok: true, data: { opened: true } };
  `);
}

/** Lê as últimas mensagens de uma conversa (abre a conversa primeiro se ainda não estiver aberta). */
export async function readMessages(chatName: string, limit = 20): Promise<WhatsAppActionResult<WhatsAppMessage[]>> {
  const opened = await openChatInternal(chatName);
  if (!opened.ok) return opened;

  return runInWhatsApp<WhatsAppMessage[]>(`
    const container = await waitFor('div[data-testid="conversation-panel-messages"]', ${READY_TIMEOUT_MS});
    const bubbles = Array.from(container.querySelectorAll('div.message-in, div.message-out')).slice(-${limit});
    const messages = bubbles.map((bubble) => {
      const textEl = bubble.querySelector('span.selectable-text, span[dir="ltr"]');
      const authorEl = bubble.querySelector('span[data-testid="author"], span[aria-label][dir="auto"]');
      const timeEl = bubble.querySelector('span[data-testid="msg-time"], span[dir="auto"] + span');
      return {
        fromMe: bubble.classList.contains('message-out'),
        author: authorEl ? authorEl.textContent || null : null,
        text: textEl ? textEl.textContent || '' : '',
        timeLabel: timeEl ? timeEl.textContent || null : null,
      };
    });
    return { ok: true, data: messages };
  `);
}

/** Envia uma mensagem numa conversa (abre a conversa primeiro se ainda não estiver aberta). Passa SEMPRE pelo Permission Manager (Nível 2, external_comm) antes de chegar aqui — ver `tools/whatsapp-tools.ts`. */
export async function sendMessage(chatName: string, text: string): Promise<WhatsAppActionResult<{ sent: boolean }>> {
  const opened = await openChatInternal(chatName);
  if (!opened.ok) return opened;

  const escapedText = JSON.stringify(text);
  return runInWhatsApp<{ sent: boolean }>(`
    const composeBox = await waitFor('div[contenteditable="true"][data-tab="10"], footer div[contenteditable="true"]', ${READY_TIMEOUT_MS});
    typeIntoField(composeBox, ${escapedText});
    await new Promise((r) => setTimeout(r, 200));
    const sendButton = document.querySelector('button[aria-label="Enviar"], span[data-icon="send"]');
    if (sendButton) {
      sendButton.click();
    } else {
      composeBox.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }
    return { ok: true, data: { sent: true } };
  `);
}
