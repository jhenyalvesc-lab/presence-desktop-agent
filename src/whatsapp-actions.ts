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

// Achado real (validação em máquina de usuária, 23/08/2026): o Planner
// já montou args com o nome de campo errado uma vez, e sem essa trava
// isso vira "undefined" digitado de verdade na busca do WhatsApp Web —
// nunca deve chegar até o navegador um valor que não seja uma string
// não-vazia de verdade.
function requireNonEmptyString(value: unknown, fieldName: string): WhatsAppActionResult<never> | null {
  if (typeof value === "string" && value.trim().length > 0) return null;
  return { ok: false, error: `argumento "${fieldName}" ausente ou inválido` };
}

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
  // Poll de condição arbitrária — usado pra confirmar que uma ação teve
  // efeito real (ex. mensagem realmente saiu), não só que um clique/tecla
  // rodou sem lançar erro.
  function waitForCondition(conditionFn, timeoutMs) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function poll() {
        let met = false;
        try {
          met = !!conditionFn();
        } catch (error) {
          met = false;
        }
        if (met) return resolve(true);
        if (Date.now() - start > timeoutMs) return reject(new Error("timeout esperando confirmação"));
        setTimeout(poll, ${POLL_INTERVAL_MS});
      })();
    });
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
  const invalid = requireNonEmptyString(query, "query");
  if (invalid) return invalid;

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

/**
 * Abre uma conversa pelo nome (busca primeiro).
 *
 * Achado real (validação em máquina de usuária, 23/08/2026): a versão
 * anterior clicava cegamente no PRIMEIRO resultado da busca, sem
 * conferir se o nome batia com o pedido — pra uma ação `external_comm`
 * (enviar mensagem), isso é um risco real de mandar mensagem pra
 * conversa errada sem ninguém perceber. Agora exige encontrar uma linha
 * cujo nome bate (exato, ou parcial como segunda tentativa) com o nome
 * pedido; se nenhuma bater, falha explicitamente em vez de adivinhar.
 */
async function openChatInternal(chatName: string): Promise<WhatsAppActionResult<{ opened: boolean; matchedName: string }>> {
  const invalid = requireNonEmptyString(chatName, "chatName");
  if (invalid) return invalid;

  const escaped = JSON.stringify(chatName);
  return runInWhatsApp<{ opened: boolean; matchedName: string }>(`
    const searchBox = await waitFor('input[data-tab="3"], div[contenteditable="true"][data-tab="3"], input[aria-label="Pesquisar ou começar uma nova conversa"]', ${READY_TIMEOUT_MS});
    typeIntoField(searchBox, ${escaped});
    await new Promise((r) => setTimeout(r, 600));
    const rows = Array.from(document.querySelectorAll('div[role="listitem"], div[data-testid="cell-frame-container"]'));
    const named = rows.map((row) => {
      const nameEl = row.querySelector('span[dir="auto"][title], span[title]');
      const name = nameEl ? (nameEl.getAttribute('title') || nameEl.textContent || '') : '';
      return { row: row, name: name };
    }).filter((entry) => entry.name);
    const target = (${escaped}).trim().toLowerCase();
    const exact = named.find((entry) => entry.name.toLowerCase() === target);
    const partial = named.find((entry) => entry.name.toLowerCase().includes(target));
    const match = exact || partial;
    if (!match) {
      typeIntoField(searchBox, "");
      return { ok: false, error: "nenhuma conversa chamada \\"" + ${escaped} + "\\" encontrada nos resultados da busca" };
    }
    match.row.click();
    await waitFor('div[data-testid="conversation-panel-messages"], div[data-testid="conversation-panel-wrapper"], footer div[contenteditable="true"], footer input[type="text"]', ${READY_TIMEOUT_MS});
    return { ok: true, data: { opened: true, matchedName: match.name } };
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

/**
 * Envia uma mensagem numa conversa (abre a conversa primeiro se ainda
 * não estiver aberta). Passa SEMPRE pelo Permission Manager (Nível 2,
 * external_comm) antes de chegar aqui — ver `tools/whatsapp-tools.ts`.
 *
 * Achado real (validação em máquina de usuária, 23/08/2026): a versão
 * anterior devolvia `{ sent: true }` só porque o clique no botão de
 * enviar (ou o fallback de tecla Enter sintética) rodou sem lançar
 * erro — nunca conferia se a mensagem realmente saiu. Um evento de
 * teclado sintético (`isTrusted: false`) frequentemente não produz o
 * mesmo efeito que uma tecla real num app como o WhatsApp Web, então
 * "concluído" podia significar "o clique aconteceu", não "a mensagem
 * foi enviada". Agora, depois do clique/tecla, confirma de verdade:
 * espera a caixa de composição esvaziar OU uma nova bolha de mensagem
 * enviada aparecer na conversa — só então retorna sucesso; do
 * contrário, falha explicitamente com o motivo.
 */
export async function sendMessage(chatName: string, text: string): Promise<WhatsAppActionResult<{ sent: boolean }>> {
  const invalidText = requireNonEmptyString(text, "text");
  if (invalidText) return invalidText;

  const opened = await openChatInternal(chatName);
  if (!opened.ok) return opened;

  const escapedText = JSON.stringify(text);
  return runInWhatsApp<{ sent: boolean }>(`
    const composeBox = await waitFor('div[contenteditable="true"][data-tab="10"], footer div[contenteditable="true"], footer input[type="text"]', ${READY_TIMEOUT_MS});
    typeIntoField(composeBox, ${escapedText});
    await new Promise((r) => setTimeout(r, 200));

    // Achado real (validação em máquina de usuária, 23/08/2026): a
    // verificação anterior também aceitava a caixa de composição ficar
    // vazia como prova de envio — mas o WhatsApp pode limpar essa caixa
    // por conta própria (comportamento de UI) mesmo sem a mensagem ter
    // saído de verdade; um teste real confirmou "sucesso" sem nada
    // chegar na conversa. A ÚNICA prova aceita agora é uma bolha de
    // mensagem enviada de verdade aparecendo na conversa ABERTA (não no
    // documento inteiro — evita contar bolhas de outra conversa/estado
    // antigo), com o texto batendo com o que foi digitado.
    const conversationContainer =
      document.querySelector('div[data-testid="conversation-panel-messages"], div[data-testid="conversation-panel-wrapper"]') || document;
    const bubbleMatchesSentText = function (bubble) {
      const textEl = bubble.querySelector('span.selectable-text, span[dir="ltr"]');
      const bubbleText = textEl ? (textEl.textContent || '') : (bubble.textContent || '');
      return bubbleText.indexOf(${escapedText}) !== -1;
    };
    const bubblesBefore = conversationContainer.querySelectorAll('div.message-out').length;

    const sendButton = document.querySelector('button[aria-label="Enviar"], span[data-icon="send"]');
    if (sendButton) {
      sendButton.click();
    } else {
      composeBox.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    }

    try {
      await waitForCondition(function () {
        const bubblesNow = Array.from(conversationContainer.querySelectorAll('div.message-out'));
        if (bubblesNow.length <= bubblesBefore) return false;
        return bubbleMatchesSentText(bubblesNow[bubblesNow.length - 1]);
      }, 8000);
    } catch (error) {
      return {
        ok: false,
        error: "não foi possível confirmar o envio: nenhuma mensagem enviada com o texto esperado apareceu na conversa aberta",
      };
    }

    return { ok: true, data: { sent: true } };
  `);
}
