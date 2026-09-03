// Presence Desktop Agent — WhatsApp (roteiro original, "Fase J"),
// opt-in explícito aceito conscientemente pela Jheny.
//
// Leitura (listar/buscar/ler) é Nível 0 (`read_only`) — executa
// sozinha, sem confirmação, exatamente como a Jheny pediu ("para ações
// de leitura, mantenha o fluxo automático quando permitido pelas
// permissões existentes"). Envio é Nível 2 (`external_comm`) — o
// Permission Manager (Fase 10F) já exige confirmação por padrão pra
// esse nível ("para envio de mensagens, mantenha obrigatoriamente a
// camada de confirmação/permissão antes da execução") — nenhuma lógica
// nova de permissão precisou ser escrita aqui, só a classificação
// correta de risco por ferramenta, que o Execution Engine já aplica
// pra qualquer ferramenta.

import { requestConversationSummary } from "../cloud-client";
import { readMessages, readMessagesForDay, searchChats, sendMessage, listChats } from "../whatsapp-actions";
import { getWhatsAppConnectionStatus } from "../whatsapp-window";
import { registerTool } from "./registry";

registerTool({
  name: "whatsapp_connection_status",
  riskTier: "read_only",
  description:
    "Verifica se o WhatsApp Web está conectado, aguardando escaneamento de QR code, ou nunca foi iniciado (heurística best-effort, nunca validada contra uma sessão real).",
  run: () => getWhatsAppConnectionStatus(),
});

registerTool({
  name: "whatsapp_list_chats",
  riskTier: "read_only",
  description: "Lista as conversas mais recentes do WhatsApp (nome, prévia da última mensagem, contagem de não lidas).",
  run: (args: { limit?: number }) => listChats(args.limit ?? 20),
});

registerTool({
  name: "whatsapp_search_chats",
  riskTier: "read_only",
  description: "Busca conversas/contatos do WhatsApp por nome.",
  run: (args: { query: string }) => searchChats(args.query),
});

registerTool({
  name: "whatsapp_read_messages",
  riskTier: "read_only",
  description:
    "Lê as últimas mensagens de uma conversa do WhatsApp, pelo nome do contato/grupo. Com transcribeAudio=true, também transcreve mensagens de voz (100% local, mais lento — só usar quando a usuária pedir explicitamente pra incluir/resumir áudios).",
  run: (args: { chatName: string; limit?: number; transcribeAudio?: boolean }) =>
    readMessages(args.chatName, args.limit ?? 20, args.transcribeAudio ?? false),
});

// Pedido explícito da Jheny (2026-09-03): "resume a conversa de dois
// dias atrás, quero que resuma toda a conversa" — diferente de
// `whatsapp_read_messages` (últimas N mensagens), aqui é o dia inteiro
// (rola a conversa pra trás até achar o começo do dia, ver
// `readMessagesForDay` em `whatsapp-actions.ts`), sempre com áudio
// transcrito, e um resumo de verdade via LLM
// (`requestConversationSummary`, mesma API da OpenAI que o Planner já
// usa — custo real, pequeno, mas não é de graça).
registerTool({
  name: "whatsapp_summarize_day",
  riskTier: "read_only",
  description:
    "Resume TODA a conversa de um dia específico do WhatsApp (daysAgo: 0 = hoje, 1 = ontem, 2 = anteontem...), incluindo mensagens de voz transcritas. Chamada real a um LLM (custo pequeno, cobrado na conta configurada) — só usar quando a usuária pedir explicitamente um resumo de um dia inteiro; pra ler só as últimas mensagens, use whatsapp_read_messages.",
  run: async (args: { chatName: string; daysAgo: number }) => {
    const read = await readMessagesForDay(args.chatName, args.daysAgo, true);
    if (!read.ok) return read;

    if (read.data.messages.length === 0) {
      return {
        ok: true,
        data: {
          summary: `Não encontrei mensagens de ${read.data.dayLabel.toLowerCase()} nessa conversa.`,
          messageCount: 0,
          dayLabel: read.data.dayLabel,
          complete: read.data.complete,
        },
      };
    }

    try {
      const summary = await requestConversationSummary(
        args.chatName,
        read.data.dayLabel,
        read.data.messages.map((m) => ({ fromMe: m.fromMe, author: m.author, text: m.text, kind: m.kind })),
      );
      return {
        ok: true,
        data: {
          summary,
          messageCount: read.data.messages.length,
          dayLabel: read.data.dayLabel,
          complete: read.data.complete,
        },
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
});

registerTool({
  name: "whatsapp_send_message",
  riskTier: "external_comm",
  description: "Envia uma mensagem de texto pra uma conversa do WhatsApp, pelo nome do contato/grupo. Sempre exige confirmação antes de executar.",
  run: (args: { chatName: string; text: string }) => sendMessage(args.chatName, args.text),
});
