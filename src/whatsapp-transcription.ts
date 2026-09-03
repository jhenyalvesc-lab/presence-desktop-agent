// Presence Desktop Agent — transcrição LOCAL de áudio (extensão da Fase
// J, pedido explícito da Jheny, 2026-09-03): "escutar" mensagens de voz
// do WhatsApp sem que o áudio saia do computador dela em NENHUM momento.
//
// Por que não reaproveitar o motor de voz que já existe (`stt-window.ts`,
// Fase 10D): aquele usa a Web Speech API do Chromium, que manda o áudio
// pros servidores do Google pra transcrever — aceitável como exceção já
// documentada só pros comandos de voz dela, mas incompatível com o
// pedido explícito aqui ("o áudio nunca fica guardado em lugar nenhum").
// Por isso: Whisper rodando 100% local (`@xenova/transformers`, mesma
// classe de dependência WASM/ONNX já usada por `tesseract.js` nesta base
// de código — sem binário nativo pra compilar, sem instalação separada).
// O modelo (pesos, não áudio pessoal) é baixado uma vez e fica em cache
// local (`userData/whisper-models`); depois disso nunca mais precisa de
// rede pra transcrever.
//
// O áudio em si NUNCA toca o disco aqui: chega como Float32Array já
// decodificado (extraído dentro da própria janela do WhatsApp, ver
// `whatsapp-actions.ts`), processado inteiramente em memória, e
// descartado (coletado pelo GC) assim que a transcrição termina — mesmo
// espírito de "nunca duplica dado sensível em outro lugar" já seguido
// pelo resto do projeto.

const CACHE_DIR_SUBPATH = "whisper-models";
const MODEL_ID = "Xenova/whisper-small";
const MAX_AUDIO_SECONDS = 180; // ~3min — voz do WhatsApp raramente passa disso; evita travar numa gravação enorme

type Transcriber = (
  audio: Float32Array,
  options?: Record<string, unknown>,
) => Promise<{ text: string }>;

let transcriberPromise: Promise<Transcriber> | null = null;

/**
 * `@xenova/transformers` é um pacote ESM-only. Este projeto compila com
 * `"module": "CommonJS"` — um `import()` comum aqui seria rebaixado pelo
 * TypeScript pra `require()`, que não consegue carregar um pacote ESM.
 * O `new Function(...)` abaixo força um `import()` NATIVO do Node,
 * escapando desse rebaixamento — contorno conhecido/documentado pra
 * exatamente este caso (pacote ESM-only consumido de um projeto CJS).
 */
async function importTransformers(): Promise<typeof import("@xenova/transformers")> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<typeof import("@xenova/transformers")>;
  return dynamicImport("@xenova/transformers");
}

async function loadTranscriber(): Promise<Transcriber> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const [{ pipeline, env }, { app }, path] = await Promise.all([
        importTransformers(),
        import("electron"),
        import("node:path"),
      ]);
      env.cacheDir = path.join(app.getPath("userData"), CACHE_DIR_SUBPATH);
      const asr = await pipeline("automatic-speech-recognition", MODEL_ID);
      return (audio: Float32Array, options?: Record<string, unknown>) =>
        asr(audio, options) as Promise<{ text: string }>;
    })();
  }
  return transcriberPromise;
}

export interface TranscribeResult {
  ok: boolean;
  text: string;
}

/**
 * Transcreve um clipe já em PCM float32 16kHz mono — nunca grava em
 * disco, nunca sai da máquina. Primeira chamada baixa o modelo (só
 * pesos do modelo, não áudio) e demora mais; chamadas seguintes reusam o
 * mesmo pipeline já carregado em memória.
 *
 * Aviso de honestidade, mesmo espírito dos seletores de DOM em
 * `whatsapp-actions.ts`: a forma exata de chamar o pipeline (Float32Array
 * cru, assumindo 16kHz) segue a API documentada do `@xenova/transformers`,
 * mas nunca foi validada contra um áudio real de voz do WhatsApp — só
 * contra a leitura da própria documentação da lib.
 */
export async function transcribePcm16k(samples: Float32Array): Promise<TranscribeResult> {
  if (samples.length === 0) return { ok: false, text: "" };
  if (samples.length / 16000 > MAX_AUDIO_SECONDS) {
    return { ok: false, text: "(áudio longo demais pra transcrever aqui)" };
  }
  try {
    const transcribe = await loadTranscriber();
    const result = await transcribe(samples, { language: "portuguese", task: "transcribe" });
    return { ok: true, text: (result.text ?? "").trim() };
  } catch (error) {
    return {
      ok: false,
      text: `(falha ao transcrever: ${error instanceof Error ? error.message : String(error)})`,
    };
  }
}
