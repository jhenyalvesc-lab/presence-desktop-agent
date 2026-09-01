// Presence Desktop Agent — Fase 10H: inspeção de Git (Nível 0, leitura,
// 100% determinístico, sem IA — exatamente como a arquitetura pede:
// "git via `child_process.exec`").
//
// Agente Universal, Fase G: `cwd` passou a ser opcional. Sem isso, uma
// pergunta natural tipo "qual o status do meu projeto?" (sem ela citar
// um caminho absoluto) obrigava o Planner a inventar um diretório — em
// vez disso, cai pra `PRESENCE_DEFAULT_REPO_PATH` (mesmo padrão de
// calibração por variável de ambiente já usado em
// `PRESENCE_APP_REGISTRY_PATH`/`PRESENCE_CLAUDE_CODE_PROCESS_PATTERN`:
// nunca um caminho real fabricado no código). Sem os dois, erro claro
// em vez de rodar `git` no cwd errado do próprio processo Electron.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { registerTool } from "./registry";

const execFileAsync = promisify(execFile);

function resolveRepoPath(cwd?: string): string {
  const resolved = cwd?.trim() || process.env["PRESENCE_DEFAULT_REPO_PATH"];
  if (!resolved) {
    throw new Error(
      "presence-agent/git-no-repo-configured: nenhum diretório de repositório informado nem configurado (PRESENCE_DEFAULT_REPO_PATH)",
    );
  }
  return resolved;
}

async function runGit(cwd: string | undefined, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: resolveRepoPath(cwd) });
  return stdout.trim();
}

registerTool({
  name: "git_status",
  riskTier: "read_only",
  description: "Mostra o status do repositório git (arquivos modificados/novos) num diretório.",
  run: (args: { cwd?: string }) => runGit(args.cwd, ["status", "--short", "--branch"]),
});

registerTool({
  name: "git_log",
  riskTier: "read_only",
  description: "Mostra os commits mais recentes de um repositório git.",
  run: (args: { cwd?: string; count?: number }) =>
    runGit(args.cwd, ["log", `-${args.count ?? 10}`, "--oneline"]),
});

registerTool({
  name: "git_branch",
  riskTier: "read_only",
  description: "Mostra o branch atual de um repositório git.",
  run: (args: { cwd?: string }) => runGit(args.cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
});

registerTool({
  name: "git_diff",
  riskTier: "read_only",
  description: "Mostra o diff das mudanças não commitadas de um repositório git.",
  run: (args: { cwd?: string }) => runGit(args.cwd, ["diff"]),
});
