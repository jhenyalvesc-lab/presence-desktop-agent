// Presence Desktop Agent — Fase 10H: inspeção de Git (Nível 0, leitura,
// 100% determinístico, sem IA — exatamente como a arquitetura pede:
// "git via `child_process.exec`").

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { registerTool } from "./registry";

const execFileAsync = promisify(execFile);

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

registerTool({
  name: "git_status",
  riskTier: "read_only",
  description: "Mostra o status do repositório git (arquivos modificados/novos) num diretório.",
  run: (args: { cwd: string }) => runGit(args.cwd, ["status", "--short", "--branch"]),
});

registerTool({
  name: "git_log",
  riskTier: "read_only",
  description: "Mostra os commits mais recentes de um repositório git.",
  run: (args: { cwd: string; count?: number }) =>
    runGit(args.cwd, ["log", `-${args.count ?? 10}`, "--oneline"]),
});

registerTool({
  name: "git_branch",
  riskTier: "read_only",
  description: "Mostra o branch atual de um repositório git.",
  run: (args: { cwd: string }) => runGit(args.cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
});

registerTool({
  name: "git_diff",
  riskTier: "read_only",
  description: "Mostra o diff das mudanças não commitadas de um repositório git.",
  run: (args: { cwd: string }) => runGit(args.cwd, ["diff"]),
});
