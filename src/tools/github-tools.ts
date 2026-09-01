// Presence Desktop Agent — Fase 10H: inspeção de GitHub (Nível 0,
// leitura, 100% determinístico, sem IA — "chamada REST direta à API
// do GitHub", exatamente como a arquitetura descreve).
//
// Exige um token pessoal da Jheny (`GITHUB_TOKEN`) — uma credencial
// externa que este código nunca fabrica nem simula, mesmo princípio já
// aplicado à AccessKey do Picovoice na Fase 10B: sem o token, lança um
// erro claro em vez de fingir sucesso.
//
// Agente Universal, Fase G: `owner`/`repo` viram opcionais, com
// fallback pra `PRESENCE_DEFAULT_GITHUB_OWNER`/`PRESENCE_DEFAULT_GITHUB_REPO`
// (mesmo espírito de `PRESENCE_DEFAULT_REPO_PATH` em `git-tools.ts`) —
// "o build passou?" não deveria exigir que ela cite dono/repositório
// toda vez. `branch` de `github_actions_status` cai pra `"main"` quando
// omitido, mesma convenção já usada em todo `git fetch origin main`
// deste projeto.

import { registerTool } from "./registry";

const GITHUB_API_BASE = "https://api.github.com";

function requireToken(): string {
  const token = process.env["GITHUB_TOKEN"];
  if (!token) throw new Error("presence-agent/github-token-missing");
  return token;
}

function resolveOwnerRepo(owner?: string, repo?: string): { owner: string; repo: string } {
  const resolvedOwner = owner?.trim() || process.env["PRESENCE_DEFAULT_GITHUB_OWNER"];
  const resolvedRepo = repo?.trim() || process.env["PRESENCE_DEFAULT_GITHUB_REPO"];
  if (!resolvedOwner || !resolvedRepo) {
    throw new Error(
      "presence-agent/github-no-repo-configured: dono/repositório não informados nem configurados (PRESENCE_DEFAULT_GITHUB_OWNER/PRESENCE_DEFAULT_GITHUB_REPO)",
    );
  }
  return { owner: resolvedOwner, repo: resolvedRepo };
}

async function githubGet(path: string): Promise<unknown> {
  const token = requireToken();
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "presence-desktop-agent",
    },
  });
  if (!response.ok) throw new Error(`presence-agent/github-request-failed:${response.status}`);
  return response.json();
}

export interface PullRequestStatus {
  state: string;
  mergeable: boolean | null;
  merged: boolean;
  title: string;
}

async function getPullRequestStatus(args: { owner?: string; repo?: string; number: number }): Promise<PullRequestStatus> {
  const { owner, repo } = resolveOwnerRepo(args.owner, args.repo);
  const data = (await githubGet(`/repos/${owner}/${repo}/pulls/${args.number}`)) as {
    state: string;
    mergeable: boolean | null;
    merged: boolean;
    title: string;
  };
  return { state: data.state, mergeable: data.mergeable, merged: data.merged, title: data.title };
}

export interface ActionsRunStatus {
  status: string;
  conclusion: string | null;
  headBranch: string;
}

async function getLatestActionsRunStatus(args: { owner?: string; repo?: string; branch?: string }): Promise<ActionsRunStatus | null> {
  const { owner, repo } = resolveOwnerRepo(args.owner, args.repo);
  const branch = args.branch?.trim() || "main";
  const data = (await githubGet(`/repos/${owner}/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=1`)) as {
    workflow_runs: { status: string; conclusion: string | null; head_branch: string }[];
  };
  const latest = data.workflow_runs[0];
  if (!latest) return null;
  return { status: latest.status, conclusion: latest.conclusion, headBranch: latest.head_branch };
}

registerTool({
  name: "github_pr_status",
  riskTier: "read_only",
  description: "Consulta o status de um Pull Request no GitHub (aberto/fechado/mesclado).",
  run: (args: { owner?: string; repo?: string; number: number }) => getPullRequestStatus(args),
});

registerTool({
  name: "github_actions_status",
  riskTier: "read_only",
  description: "Consulta o status da última execução do GitHub Actions para um branch (build/CI).",
  run: (args: { owner?: string; repo?: string; branch?: string }) => getLatestActionsRunStatus(args),
});
