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
import type {
  ClaudeCodeConfirmationCheckResult,
  ClaudeCodeProcessStatusResult,
} from "./tools/claude-code-tools";
import type { ActionsRunStatus, PullRequestStatus } from "./tools/github-tools";
import type { ProcessInfo } from "./tools/process-tools";
import type { WhatsAppActionResult, WhatsAppChatSummary, WhatsAppMessage } from "./whatsapp-actions";

const MAX_ITEMS_SPOKEN = 3;
const MAX_GIT_TEXT_SPOKEN = 300;

function capText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

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
  const parts = last.map((message) => {
    const who = message.fromMe ? "você disse" : (message.author ?? "a pessoa disse");
    // Marca o que veio de transcrição de áudio, pra nunca confundir com
    // texto digitado de verdade — extensão da Fase J, pedido explícito da
    // Jheny (transcrição 100% local, ver `whatsapp-transcription.ts`).
    const label = message.kind === "audio" ? (message.transcribed ? "(áudio) " : "(áudio não transcrito) ") : "";
    return `${who}: ${label}${message.text}`;
  });
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

  // Agente Universal, Fase G: dá voz de verdade ao que a Fase 10H já
  // sabe checar (Claude Code/git/GitHub) — antes disso, qualquer uma
  // dessas ferramentas caía no genérico `${label}.` (a INTENÇÃO
  // gerada pelo Planner antes de rodar, nunca o resultado real).
  if (tool === "claude_code_process_status") {
    const status = result as ClaudeCodeProcessStatusResult;
    if (!status.running) return "Não encontrei nenhum processo do Claude Code rodando agora.";
    if (status.matches.length === 1) {
      const match = status.matches[0];
      return `Sim, encontrei um processo do Claude Code rodando (${match.name}, pid ${match.pid}).`;
    }
    return `Sim, encontrei ${status.matches.length} processos que parecem do Claude Code rodando.`;
  }
  if (tool === "claude_code_confirmation_check") {
    const check = result as ClaudeCodeConfirmationCheckResult;
    if (!check.windowFound) return "Não encontrei nenhuma janela do Claude Code aberta agora.";
    if (check.heuristic?.matched) {
      return "Pelo que consegui ler na tela, parece que o Claude Code está esperando uma confirmação sua — mas isso é só uma estimativa, não tenho certeza.";
    }
    return "Encontrei a janela do Claude Code aberta, mas não percebi nenhum pedido de confirmação na tela — pode estar processando ainda (estimativa, não tenho certeza).";
  }
  if (tool === "git_status" || tool === "git_branch" || tool === "git_log") {
    const text = typeof result === "string" ? result.trim() : "";
    const capped = capText(text, MAX_GIT_TEXT_SPOKEN);
    if (tool === "git_branch") return capped ? `Você está no branch ${capped}.` : "Não consegui identificar o branch atual.";
    if (tool === "git_log") return capped ? `Últimos commits: ${capped}` : "Não encontrei nenhum commit.";
    return capped ? `Status do git: ${capped}` : "O repositório está limpo, sem mudanças pendentes.";
  }
  if (tool === "git_diff") {
    const text = typeof result === "string" ? result.trim() : "";
    return text.length === 0
      ? "Nenhuma mudança pendente."
      : "Tem mudanças não commitadas — não vou ler o diff inteiro em voz alta, mas dá pra ver os detalhes na tela.";
  }
  if (tool === "github_pr_status") {
    const pr = result as PullRequestStatus;
    if (pr.merged) return `O Pull Request "${pr.title}" já foi mesclado.`;
    if (pr.state !== "open") return `O Pull Request "${pr.title}" foi fechado sem mesclar.`;
    if (pr.mergeable === false) return `O Pull Request "${pr.title}" está aberto, mas tem conflito.`;
    return `O Pull Request "${pr.title}" está aberto.`;
  }
  if (tool === "github_actions_status") {
    const run = result as ActionsRunStatus | null;
    if (!run) return "Não encontrei nenhuma execução do GitHub Actions nesse branch.";
    if (run.status !== "completed") return `A última execução no branch ${run.headBranch} ainda está em andamento.`;
    if (run.conclusion === "success") return `O build passou — última execução no branch ${run.headBranch} concluída com sucesso.`;
    return `O build falhou na última execução do branch ${run.headBranch} (${run.conclusion ?? "motivo desconhecido"}).`;
  }
  if (tool === "list_processes") {
    const processes = result as ProcessInfo[];
    return `Encontrei ${processes.length} processos rodando agora.`;
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
