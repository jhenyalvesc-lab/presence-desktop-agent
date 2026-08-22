// Presence Desktop Agent — Fase 10C: detector de duas palmas (DSP local).
//
// Sem lib pronta (a arquitetura já previa isso) — transiente de
// amplitude simples sobre o mesmo stream de PCM que alimenta o Wake
// Word (mesmo Audio Worker, mesmo laço de frames em `audio-worker.ts`,
// sem segundo pipeline de áudio). Falsos positivos/negativos são
// esperados nesse tipo de detector — por isso a sensibilidade (e a
// janela de tempo entre as duas palmas) é configurável, nunca fixa.

export interface ClapDetectorConfig {
  /** 0..1 — mais alto detecta palmas mais fracas, à custa de mais falsos positivos. */
  sensitivity: number;
  /** Menor intervalo aceito entre as duas palmas. */
  minGapMs: number;
  /** Maior intervalo aceito entre as duas palmas. */
  maxGapMs: number;
  /** Tempo mínimo entre dois "onsets" distintos — ignora a cauda/reverberação da mesma palma. */
  debounceMs: number;
}

export const DEFAULT_CLAP_CONFIG: ClapDetectorConfig = {
  sensitivity: 0.5,
  minGapMs: 150,
  maxGapMs: 600,
  debounceMs: 100,
};

const INT16_MAX = 32767;

export class ClapDetector {
  private readonly config: ClapDetectorConfig;
  private readonly threshold: number;
  private lastOnsetAt: number | null = null;
  private pendingFirstClapAt: number | null = null;
  private wasAboveThreshold = false;

  constructor(config: Partial<ClapDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CLAP_CONFIG, ...config };
    const clampedSensitivity = Math.min(1, Math.max(0, this.config.sensitivity));
    // Sensibilidade 0..1 mapeada para um limiar de amplitude entre ~15%
    // (bem sensível) e ~75% (pouco sensível) da escala de um sample Int16.
    this.threshold = Math.round(INT16_MAX * (0.75 - clampedSensitivity * 0.6));
  }

  /** Processa um frame de PCM (Int16) capturado pelo pvrecorder. Devolve `true` só no instante em que as DUAS palmas acabam de ser confirmadas. */
  process(frame: Int16Array, now: number = Date.now()): boolean {
    const isAboveThreshold = peakAmplitude(frame) >= this.threshold;

    let onsetNow = false;
    if (isAboveThreshold && !this.wasAboveThreshold) {
      if (this.lastOnsetAt === null || now - this.lastOnsetAt >= this.config.debounceMs) {
        onsetNow = true;
        this.lastOnsetAt = now;
      }
    }
    this.wasAboveThreshold = isAboveThreshold;

    if (!onsetNow) {
      if (this.pendingFirstClapAt !== null && now - this.pendingFirstClapAt > this.config.maxGapMs) {
        this.pendingFirstClapAt = null;
      }
      return false;
    }

    if (this.pendingFirstClapAt === null) {
      this.pendingFirstClapAt = now;
      return false;
    }

    const gap = now - this.pendingFirstClapAt;
    if (gap >= this.config.minGapMs && gap <= this.config.maxGapMs) {
      this.pendingFirstClapAt = null;
      return true;
    }

    // Onset fora da janela esperada (cedo demais/tarde demais) — não
    // descarta: vira o novo candidato a "primeira palma".
    this.pendingFirstClapAt = now;
    return false;
  }
}

function peakAmplitude(frame: Int16Array): number {
  let peak = 0;
  for (let i = 0; i < frame.length; i++) {
    const abs = Math.abs(frame[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

export function readClapConfigFromEnv(): Partial<ClapDetectorConfig> {
  return {
    sensitivity: parseNumber(process.env["PRESENCE_CLAP_SENSITIVITY"], DEFAULT_CLAP_CONFIG.sensitivity),
    minGapMs: parseNumber(process.env["PRESENCE_CLAP_MIN_GAP_MS"], DEFAULT_CLAP_CONFIG.minGapMs),
    maxGapMs: parseNumber(process.env["PRESENCE_CLAP_MAX_GAP_MS"], DEFAULT_CLAP_CONFIG.maxGapMs),
    debounceMs: parseNumber(process.env["PRESENCE_CLAP_DEBOUNCE_MS"], DEFAULT_CLAP_CONFIG.debounceMs),
  };
}

export function isClapDetectionEnabled(): boolean {
  return process.env["PRESENCE_CLAP_ENABLED"] !== "false";
}

function parseNumber(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number.parseFloat(raw) : NaN;
  return Number.isNaN(parsed) ? fallback : parsed;
}
