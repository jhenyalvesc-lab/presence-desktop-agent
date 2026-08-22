// Presence Desktop Agent — Fase 10E: arquivos (Nível 0, leitura, sem IA).

import fs from "node:fs/promises";

import { registerTool } from "./registry";

const MAX_READ_BYTES = 200_000;

async function readFile(args: { filePath: string }): Promise<{ content: string; truncated: boolean }> {
  const stats = await fs.stat(args.filePath);
  const handle = await fs.open(args.filePath, "r");
  try {
    const truncated = stats.size > MAX_READ_BYTES;
    const buffer = Buffer.alloc(Math.min(stats.size, MAX_READ_BYTES));
    await handle.read(buffer, 0, buffer.length, 0);
    return { content: buffer.toString("utf-8"), truncated };
  } finally {
    await handle.close();
  }
}

registerTool({
  name: "read_file",
  riskTier: "read_only",
  description: "Lê o conteúdo (texto) de um arquivo existente, até um limite de tamanho.",
  run: (args: { filePath: string }) => readFile(args),
});
