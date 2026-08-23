// Presence Desktop Agent — Fase 10E: carrega todas as ferramentas no
// Tool Registry. Importar este módulo uma vez (`main.ts`) já registra
// tudo — cada arquivo de tool se registra sozinho ao ser importado.

import "./process-tools";
import "./window-tools";
import "./screenshot-tools";
import "./ocr-tools";
import "./file-tools";
import "./input-tools";
import "./notification-tools";
import "./git-tools";
import "./github-tools";
import "./claude-code-tools";
import "./whatsapp-tools";

export { getTool, listTools, registerTool } from "./registry";
export type { RiskTier, ToolDefinition } from "./types";
