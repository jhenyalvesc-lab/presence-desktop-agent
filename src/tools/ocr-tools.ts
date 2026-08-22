// Presence Desktop Agent — Fase 10E: leitura de tela via OCR (Nível 0,
// leitura, sem IA — reconhecimento de texto por WASM local, não é uma
// chamada de LLM).
//
// `tesseract.js` baixa o modelo de linguagem (`.traineddata`) na
// primeira vez que roda, sob demanda (rede) — não embutido no
// instalador. Isso é uma característica documentada da própria lib,
// não uma omissão desta implementação; só confirmável com rede real.
// Também depende de `screenshot-desktop` — mesmo limite de tempo e
// mesmo risco de travamento documentado em `screenshot-tools.ts`.

import screenshot from "screenshot-desktop";
import { createWorker } from "tesseract.js";

import { registerTool } from "./registry";
import { withTimeout } from "./timeout";

const OCR_TIMEOUT_MS = 30_000;

async function ocrScreen(): Promise<{ text: string }> {
  return withTimeout(runOcr(), OCR_TIMEOUT_MS, "ocr_screen");
}

async function runOcr(): Promise<{ text: string }> {
  const imageBuffer = await screenshot();
  const worker = await createWorker("por");
  try {
    const {
      data: { text },
    } = await worker.recognize(imageBuffer);
    return { text };
  } finally {
    await worker.terminate();
  }
}

registerTool({
  name: "ocr_screen",
  riskTier: "read_only",
  description: "Lê o texto visível na tela atual via OCR.",
  run: () => ocrScreen(),
});
