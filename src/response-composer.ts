// Presence Desktop Agent — Response Composer (roteiro original da
// arquitetura, seção "Response Composer"): transforma o resultado já
// executado de um comando (determinístico ou via Planner) numa frase
// curta em português pra ser falada de volta — nunca decide nem
// executa nada, só descreve o que já aconteceu de verdade.
//
// Fica deliberadamente simples: reconhece algumas ferramentas
// conhecidas (WhatsApp, abrir app) pra dar uma resposta útil, e cai num
// resumo genérico pra qualquer outra — nunca inventa detalhe que o
// resultado não contenha.

import type { CommandResolution } from "./command-resolver";
import type { PlannerResolution, PlannerStepOutcome } from "./planner";
import type { WhatsAppActionResult, WhatsAppChatSummary, WhatsAppMessage } from "./whatsapp-actions";

const MAX_ITEMS_SPOKEN = 3;

function describeChats(chats: WhatsAppChatSummary[]): string {
  if (chats.length === 0) return "Nenhuma conversa encontrada.";
  const top = chats.slice(0, MAX_ITEMS_SPOKEN);
  const parts = top.map((chat) =>
    chat.unreadCount > 0 ? `${chat.name}, com ${chat.unreadCount} não lidas` : chat.name,
  );
  const suffix = chats.length > top.length ? `, entre outras ${chats.length - top.length}` : "";
  return `Encontrei: ${parts.join("; ")}${suffix}.`;
}

function describeMessages(messages: WhatsAppMessage[]): string {
  if (messages.length === 0) return "Não encontrei mensagens nessa conversa.";
  const last = messages.slice(-MAX_ITEMS_SPOKEN);
  const parts = last.map((message) => `${message.fromMe ? "você disse" : (message.author ?? "a pessoa disse")}: ${message.text}`);
  return `Últimas mensagens — ${parts.join(". ")}.`;
}

/** Descreve o `result` de UMA ferramenta já executada, quando reconhecida; `null` se não houver nada específico a dizer (cai pro resumo genérico de quem chama). */
function describeToolResult(tool: string, result: unknown): string | null {
  if (tool === "whatsapp_list_chats" || tool === "whatsapp_search_chats") {
    const action = result as WhatsAppActionResult<WhatsAppChatSummary[]> | undefined;
    if (action?.ok) return describeChats(action.data);
    return action && !action.ok ? `Não consegui: ${action.error}` : null;
  }
  if (tool === "whatsapp_read_messages") {
    const action = result as WhatsAppActionResult<WhatsAppMessage[]> | undefined;
    if (action?.ok) return describeMessages(action.data);
    return action && !action.ok ? `Não consegui: ${action.error}` : null;
  }
  if (tool === "whatsapp_send_message") {
    const action = result as WhatsAppActionResult<{ sent: boolean }> | undefined;
    if (action?.ok) return "Mensagem enviada.";
    return action && !action.ok ? `Não consegui enviar: ${action.error}` : null;
  }
  return null;
}

/** Comando resolvido pelo resolvedor determinístico (hoje só "abre X"). */
export function composeSpeechForResolution(resolution: CommandResolution): string | null {
  if (!resolution.matched) return null;
  if (!resolution.ok) return `Não consegui: ${resolution.error}`;

  const specific = describeToolResult(resolution.tool, resolution.result);
  return specific ?? `Pronto: ${resolution.label}.`;
}

/** Comando resolvido via Planner (composto, decidido pela IA). */
export function composeSpeechForPlan(plan: PlannerResolution): string {
  if (plan.status === "no_plan") return plan.clarification;
  if (plan.status === "error") return `Tive um problema para planejar isso: ${plan.error}`;

  const failed = plan.steps.find((step) => !step.ok);
  if (failed) return `Não consegui: ${failed.label}${failed.error ? ` — ${failed.error}` : ""}.`;

  const spoken: string[] = [];
  for (const step of plan.steps as PlannerStepOutcome[]) {
    const specific = describeToolResult(step.tool, step.result);
    spoken.push(specific ?? `${step.label}.`);
  }
  return spoken.join(" ") || "Feito.";
}
