// Presence Desktop Agent — ponte ao Agent Core da nuvem (2026-09-03).
//
// Pedido explícito da Jheny, depois de confirmar (auditoria de código) que
// o Desktop Agent só enxergava sua própria ferramenta local — as ~35
// ferramentas do Agent Core da nuvem (tarefas, hábitos, agenda,
// financeiro, memória, lembretes, projetos, busca web) só eram
// alcançáveis pelo chat do site. Restrição dela: tudo tem que acontecer
// dentro do próprio app/voz do desktop, nunca abrindo navegador nem
// redirecionando pro site.
//
// Cada ferramenta aqui é um PROXY: `run()` só chama `executeCloudTool`
// (`cloud-client.ts`), que manda pro endpoint device-autenticado
// `/api/presence/agent/execute` (repositório principal,
// `presence-agent-device-tools.server.ts`) — a lógica de verdade (banco,
// validação) mora só lá, nunca duplicada aqui. Por serem registradas no
// MESMO Tool Registry local (`registry.ts`) que qualquer ferramenta local,
// herdam de graça o mesmo Execution Engine — confirmação por voz/diálogo
// quando o `riskTier` exige, Audit Log — sem nenhuma mudança em
// `execution-engine.ts`/`confirmation-broker.ts`.
//
// Escopo desta rodada (ver plan.md do repositório principal, §17):
// tarefas, hábitos, agenda, financeiro (resumo + transação), memória,
// lembretes, projetos (listar) e busca web — os domínios mais prováveis de
// pedido por voz. Não inclui ainda Pastas do Projeto/Drive, dossiês,
// apagar projeto inteiro, mover tarefa — próxima rodada, com aprovação
// explícita antes de começar.
//
// `riskTier`/descrição espelham `presence-agent-tools.ts` (repositório
// principal) de propósito — mesma classificação de risco pro mesmo dado
// real, nunca uma decisão de segurança nova inventada aqui.

import { executeCloudTool } from "../cloud-client";
import { registerTool } from "./registry";

/** Roda uma ferramenta de nuvem e devolve o resultado — lança em caso de falha (mesmo contrato de qualquer `ToolDefinition.run`, o Execution Engine já trata `throw` como outcome "error"). */
async function runCloudTool(tool: string, args: unknown): Promise<unknown> {
  const outcome = await executeCloudTool(tool, args);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.result;
}

const CLOUD_TOOLS: { name: string; riskTier: "read_only" | "reversible" | "destructive"; description: string }[] = [
  // Tarefas
  { name: "list_tasks", riskTier: "read_only", description: "Lista as tarefas reais da usuária." },
  { name: "create_task", riskTier: "reversible", description: "Cria uma tarefa nova." },
  {
    name: "update_task",
    riskTier: "reversible",
    description: "Edita uma tarefa já existente, pelo id (título, prazo, prioridade, status etc.).",
  },
  { name: "delete_task", riskTier: "destructive", description: "Apaga uma tarefa existente, pelo id." },
  // Hábitos
  { name: "list_habits", riskTier: "read_only", description: "Lista os hábitos reais da usuária." },
  { name: "create_habit", riskTier: "reversible", description: "Cria um hábito novo pra acompanhar." },
  {
    name: "update_habit",
    riskTier: "reversible",
    description: "Edita o nome e/ou horário-alvo de um hábito já existente, pelo id.",
  },
  { name: "delete_habit", riskTier: "destructive", description: "Apaga um hábito existente, pelo id." },
  // Agenda
  {
    name: "list_calendar_events",
    riskTier: "read_only",
    description: "Lista os compromissos reais da usuária nos próximos 30 dias.",
  },
  {
    name: "create_calendar_event",
    riskTier: "reversible",
    description: "Cria um compromisso novo na agenda.",
  },
  {
    name: "update_calendar_event",
    riskTier: "reversible",
    description: "Edita título, horário e/ou local de um compromisso já existente, pelo id.",
  },
  {
    name: "delete_calendar_event",
    riskTier: "destructive",
    description: "Apaga um compromisso existente, pelo id.",
  },
  // Financeiro
  {
    name: "get_finance_summary",
    riskTier: "read_only",
    description: "Resumo financeiro real (saldo, receitas, despesas, categorias, transações recentes).",
  },
  {
    name: "create_transaction",
    riskTier: "reversible",
    description: "Registra uma transação financeira nova (receita ou despesa).",
  },
  {
    name: "update_transaction",
    riskTier: "reversible",
    description: "Edita valor, descrição, categoria e/ou outros dados de uma transação já existente, pelo id.",
  },
  {
    name: "delete_transaction",
    riskTier: "destructive",
    description: "Apaga uma transação financeira existente, pelo id.",
  },
  // Memória / projetos
  { name: "list_projects", riskTier: "read_only", description: "Lista os projetos reais da usuária." },
  {
    name: "create_memory_note",
    riskTier: "reversible",
    description:
      "Guarda um fato/nota na memória pessoal, opcionalmente ligado a um projeto e a um dossiê dentro dele.",
  },
  {
    name: "update_memory_note",
    riskTier: "reversible",
    description: "Edita o conteúdo de uma nota de memória já existente, pelo id.",
  },
  {
    name: "delete_memory_note",
    riskTier: "destructive",
    description: "Apaga uma nota de memória existente, pelo id.",
  },
  // Lembretes
  {
    name: "list_reminders",
    riskTier: "read_only",
    description:
      "Lista os lembretes reais configurados — vinculados (tarefa/hábito/compromisso) e avulsos.",
  },
  {
    name: "create_reminder_rule",
    riskTier: "reversible",
    description:
      "Define os lembretes (push) de uma tarefa, hábito ou compromisso já existente, pelo id — substitui o conjunto de lembretes daquele item.",
  },
  {
    name: "clear_reminder_rules",
    riskTier: "destructive",
    description: "Remove TODOS os gatilhos de lembrete de uma tarefa, hábito ou compromisso, pelo id e tipo.",
  },
  {
    name: "cancel_follow_up",
    riskTier: "destructive",
    description: "Cancela um lembrete avulso pendente, pelo texto da mensagem.",
  },
  // Web
  {
    name: "search_web",
    riskTier: "read_only",
    description: "Pesquisa real na web (conhecimento externo, notícias, explicações).",
  },
];

for (const tool of CLOUD_TOOLS) {
  registerTool({
    name: tool.name,
    riskTier: tool.riskTier,
    description: tool.description,
    run: (args: unknown) => runCloudTool(tool.name, args),
  });
}
