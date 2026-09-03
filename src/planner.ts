// Presence Desktop Agent — Planner (roteiro original da arquitetura,
// "Fase H").
//
// O documento de arquitetura aprovado só descrevia isto como
// "tarefas compostas, decomposição por IA, execução sequencial
// determinística de cada passo" — sem especificar o mecanismo real de
// como o Desktop Agent chamaria um LLM, dado que ele nunca segura um
// JWT de sessão (só uma credencial de dispositivo). Perguntada
// explicitamente sobre essa lacuna, a Jheny escolheu: um novo endpoint
// de nuvem device-autenticado (`/api/presence/agent/plan`, repositório
// principal) que chama o mesmo Lovable AI Gateway já usado por
// `askPresence` — nenhum mecanismo de IA paralelo.
//
// Só é chamado como FALLBACK, depois que o resolvedor determinístico
// (`command-resolver.ts`) já tentou e não bateu com nada — mesmo
// princípio Local-First/AI-on-demand da arquitetura: filtra localmente
// primeiro, só recorre à IA quando o determinístico já falhou.
//
// O backend NUNCA executa nada — só propõe uma lista ordenada de
// passos (ferramenta + args em JSON + rótulo). A validação de segurança
// real acontece aqui, na hora de executar: cada passo passa pelo MESMO
// Execution Engine que qualquer outra execução (Permission Manager,
// confirmação quando exigida, Audit Log) — um nome de ferramenta
// inventado pelo modelo simplesmente falha com "not_found" na hora de
// rodar, nunca é confiado antes disso.

import { requestPlan, type PlanStep, type PlanToolDescriptor } from "./cloud-client";
import { executeTool } from "./execution-engine";
import { loadAppRegistry } from "./tools/app-registry";
import { listTools } from "./tools/registry";

// Dica de formato de args por ferramenta, só pra descrever o contrato
// no prompt do Planner — não afeta a execução em si (cada ferramenta já
// valida/usa seus próprios args do jeito que sempre validou). Ferramenta
// sem entrada aqui simplesmente não recebe dica (args: {}).
const ARGS_HINTS: Record<string, string> = {
  move_mouse: '{"x": <número>, "y": <número>}',
  click_mouse: '{"button": "left" | "right"} (opcional, padrão "left")',
  type_text: '{"text": "<texto a digitar>"}',
  focus_window: '{"windowId": <número, de list_windows>}',
  close_window: '{"processId": <número, de list_windows>}',
  read_file: '{"filePath": "<caminho absoluto>"}',
  show_notification: '{"title": "<título>", "body": "<corpo>"}',
  git_status: '{"cwd": "<diretório absoluto do repositório, opcional — omita se ela não citou um caminho>"}',
  git_log: '{"cwd": "<diretório absoluto, opcional>", "count": <número, opcional>}',
  git_branch: '{"cwd": "<diretório absoluto, opcional>"}',
  git_diff: '{"cwd": "<diretório absoluto, opcional>"}',
  github_pr_status: '{"owner": "<dono, opcional>", "repo": "<repositório, opcional>", "number": <número>}',
  github_actions_status: '{"owner": "<dono, opcional>", "repo": "<repositório, opcional>", "branch": "<branch, opcional, padrão \\"main\\">"}',
  // Achado real (validação em máquina de usuária, 23/08/2026): sem
  // dica aqui, o Planner montou args com nomes de campo errados pra
  // whatsapp_send_message (ex. algo diferente de "chatName"/"text"),
  // fazendo o próprio texto "undefined" ser digitado na busca do
  // WhatsApp Web. Ferramenta sem entrada em ARGS_HINTS não tem NENHUMA
  // garantia de que o modelo acerte o nome exato do campo — precisa de
  // dica explícita, igual as outras ferramentas abaixo.
  whatsapp_list_chats: '{"limit": <número, opcional, padrão 20>}',
  whatsapp_search_chats: '{"query": "<nome do contato ou grupo>"}',
  whatsapp_read_messages:
    '{"chatName": "<nome exato do contato ou grupo>", "limit": <número, opcional, padrão 20>, "transcribeAudio": <true|false, opcional, padrão false — true só quando a usuária pedir explicitamente pra incluir, ouvir ou resumir mensagens de voz/áudio daquela conversa>}',
  whatsapp_summarize_day:
    '{"chatName": "<nome exato do contato ou grupo>", "daysAgo": <número inteiro — 0 = hoje, 1 = ontem, 2 = anteontem, 3 = três dias atrás, etc.>}',
  whatsapp_send_message: '{"chatName": "<nome exato do contato ou grupo>", "text": "<texto da mensagem>"}',

  // Ponte ao Agent Core da nuvem (2026-09-03, `tools/cloud-tools.ts`) —
  // mesmas dicas de argumento do catálogo equivalente no repositório
  // principal (`presence-agent-tools.ts`), reaproveitadas de propósito.
  create_task:
    '{"title": "<título>", "priority": "alta|média|baixa (opcional)", "dueAt": "<ISO local, opcional>"}',
  update_task:
    '{"taskId": "<id>", "title": "<opcional>", "status": "pending|in_progress|done (opcional)", "dueAt": "<ISO local, opcional>"}',
  delete_task: '{"taskId": "<id>"}',
  create_habit: '{"name": "<nome>", "targetTime": "HH:mm (opcional)"}',
  update_habit: '{"habitId": "<id>", "name": "<opcional>", "targetTime": "HH:mm (opcional)"}',
  delete_habit: '{"habitId": "<id>"}',
  create_calendar_event:
    '{"title": "<título>", "startAt": "<ISO local>", "endAt": "<ISO local>", "location": "<opcional>"}',
  update_calendar_event:
    '{"eventId": "<id>", "title": "<opcional>", "startAt": "<ISO local, opcional>", "endAt": "<ISO local, opcional>", "location": "<opcional>"}',
  delete_calendar_event: '{"eventId": "<id>"}',
  create_transaction:
    '{"type": "income|expense", "amount": <número>, "description": "<descrição>", "category": "<opcional>"}',
  update_transaction:
    '{"transactionId": "<id>", "amount": <número, opcional>, "description": "<opcional>", "category": "<opcional>"}',
  delete_transaction: '{"transactionId": "<id>"}',
  create_memory_note: '{"content": "<conteúdo>", "projectName": "<opcional>", "entityName": "<opcional>"}',
  update_memory_note: '{"noteId": "<id>", "content": "<novo conteúdo>"}',
  delete_memory_note: '{"noteId": "<id>"}',
  create_reminder_rule:
    '{"sourceKind": "task|habit|event", "sourceId": "<id>", "offsetsMinutes": [<minutos antes, ex.: 10080 p/ 1 semana, 4320 p/ 3 dias, 1440 p/ 1 dia, 0 p/ na hora>]}',
  clear_reminder_rules: '{"sourceKind": "task|habit|event", "sourceId": "<id>"}',
  cancel_follow_up: '{"message": "<trecho da mensagem do lembrete>"}',
  search_web: '{"query": "<termo>"}',
};

function buildToolCatalog(): PlanToolDescriptor[] {
  return listTools().map((tool) => {
    if (tool.name === "open_app") {
      const apps = loadAppRegistry();
      const argsHint =
        apps.length > 0
          ? `{"name": exatamente um destes: ${apps.map((app) => `"${app.name}" (${app.displayName})`).join(", ")}}`
          : '{"name": "<nome cadastrado no App Registry>"} (App Registry vazio nesta máquina — provavelmente nenhum vai casar)';
      return { name: tool.name, description: tool.description, riskTier: tool.riskTier, argsHint };
    }
    return {
      name: tool.name,
      description: tool.description,
      riskTier: tool.riskTier,
      argsHint: ARGS_HINTS[tool.name],
    };
  });
}

export interface PlannerStepOutcome {
  tool: string;
  label: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export type PlannerResolution =
  | { status: "no_plan"; clarification: string }
  | { status: "executed"; steps: PlannerStepOutcome[]; allSucceeded: boolean }
  | { status: "error"; error: string };

/**
 * Executa um comando via Planner: pede a decomposição à nuvem, depois
 * roda cada passo em sequência pelo Execution Engine. Para na primeira
 * falha (passo malformado, ferramenta negada/erro) — passos sequenciais
 * de um plano tipicamente dependem do anterior ter dado certo, então
 * não arrisca continuar uma cadeia já quebrada.
 */
export async function planAndExecuteCommand(command: string): Promise<PlannerResolution> {
  const tools = buildToolCatalog();
  if (tools.length === 0) {
    return { status: "no_plan", clarification: "Nenhuma ferramenta disponível ainda neste agente." };
  }

  let plan;
  try {
    plan = await requestPlan(command, tools);
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }

  if (plan.steps.length === 0) {
    return { status: "no_plan", clarification: plan.clarification ?? "Não entendi o que fazer." };
  }

  const outcomes = await executePlanSteps(plan.steps);
  return { status: "executed", steps: outcomes, allSucceeded: outcomes.every((outcome) => outcome.ok) };
}

/**
 * Roda uma lista de passos já decompostos, em sequência, parando na
 * primeira falha (passo malformado, ferramenta negada/erro) — separado
 * de `planAndExecuteCommand` pra ser testável sem depender da chamada
 * de rede ao Planner (mesmo espírito de `checkConfirmationHeuristic`
 * na Fase 10H: extrair a parte determinística pra um harness sintético
 * conseguir validar de verdade, sem mockar rede).
 */
export async function executePlanSteps(steps: PlanStep[]): Promise<PlannerStepOutcome[]> {
  const outcomes: PlannerStepOutcome[] = [];
  for (const step of steps) {
    let args: unknown;
    try {
      args = JSON.parse(step.argsJson);
    } catch {
      outcomes.push({ tool: step.tool, label: step.label, ok: false, error: "argumentos inválidos" });
      break;
    }

    const outcome = await executeTool(step.tool, args);
    if (outcome.ok) {
      outcomes.push({ tool: step.tool, label: step.label, ok: true, result: outcome.result });
      continue;
    }

    const error = outcome.reason === "denied" ? "confirmação negada" : (outcome.detail ?? outcome.reason);
    outcomes.push({ tool: step.tool, label: step.label, ok: false, error });
    break;
  }
  return outcomes;
}
