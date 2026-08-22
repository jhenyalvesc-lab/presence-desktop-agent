// Presence Desktop Agent — Fase 10E: processos (Nível 0, leitura, sem IA).

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { registerTool } from "./registry";

const execFileAsync = promisify(execFile);

export interface ProcessInfo {
  pid: number;
  name: string;
}

async function listProcesses(): Promise<ProcessInfo[]> {
  if (process.platform === "win32") {
    const { stdout } = await execFileAsync("tasklist", ["/fo", "csv", "/nh"]);
    return stdout
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        // Formato real do tasklist: campos entre aspas, separados por
        // vírgula ("chrome.exe","1234","Console","1","123.456 K") — só
        // dividir na sequência `","` evita quebrar por vírgulas dentro
        // de um campo (ex. o de uso de memória).
        const columns = line.split('","').map((value) => value.replace(/^"|"$/g, ""));
        return { name: columns[0] ?? "", pid: Number.parseInt(columns[1] ?? "0", 10) };
      });
  }

  const { stdout } = await execFileAsync("ps", ["-eo", "pid,comm"]);
  return stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const spaceIndex = line.indexOf(" ");
      return { pid: Number.parseInt(line.slice(0, spaceIndex), 10), name: line.slice(spaceIndex + 1).trim() };
    });
}

registerTool({
  name: "list_processes",
  riskTier: "read_only",
  description: "Lista os processos em execução no computador.",
  run: () => listProcesses(),
});
