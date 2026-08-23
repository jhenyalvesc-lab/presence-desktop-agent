// Presence Desktop Agent — WhatsApp (roteiro original, "Fase J"),
// opt-in explícito aceito conscientemente pela Jheny.
//
// Só uma ferramenta nesta fatia: verificar o status da conexão. Leitura
// de mensagens/busca/resumo (a capacidade real que justifica o risco
// aceito) exige iterar contra uma sessão real do WhatsApp Web pra
// descobrir a estrutura de DOM certa pra extrair — este sandbox não
// alcança `web.whatsapp.com` nem tem uma conta pra logar, então não dá
// pra construir isso às cegas e chamar de pronto. Registrado como
// pendência real, não fabricado.

import { getWhatsAppConnectionStatus } from "../whatsapp-window";
import { registerTool } from "./registry";

registerTool({
  name: "whatsapp_connection_status",
  riskTier: "read_only",
  description:
    "Verifica se o WhatsApp Web está conectado, aguardando escaneamento de QR code, ou nunca foi iniciado (heurística best-effort, nunca validada contra uma sessão real).",
  run: () => getWhatsAppConnectionStatus(),
});
