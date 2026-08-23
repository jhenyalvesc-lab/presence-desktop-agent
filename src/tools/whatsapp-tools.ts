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

import { readMessages, searchChats, sendMessage, listChats } from "../whatsapp-actions";
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
  description: "Lê as últimas mensagens de uma conversa do WhatsApp, pelo nome do contato/grupo.",
  run: (args: { chatName: string; limit?: number }) => readMessages(args.chatName, args.limit ?? 20),
});

registerTool({
  name: "whatsapp_send_message",
  riskTier: "external_comm",
  description: "Envia uma mensagem de texto pra uma conversa do WhatsApp, pelo nome do contato/grupo. Sempre exige confirmação antes de executar.",
  run: (args: { chatName: string; text: string }) => sendMessage(args.chatName, args.text),
});
