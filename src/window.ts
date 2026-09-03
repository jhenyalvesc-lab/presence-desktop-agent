// Presence Desktop Agent — Fase A: janela de status.
//
// Painel técnico de diagnóstico (pareamento/wake word/duas palmas/fila de
// comandos) — não é mais a janela que abre por padrão (ver app-window.ts
// pra interface completa do Presence); nasce escondida (`show: false`) e
// só aparece via `showMainWindow()` (item "Status do dispositivo" na
// bandeja, ou quando uma confirmação real precisa da atenção da usuária).
//
// Fechar esta janela NUNCA encerra o processo (CLAUDE.md §17: "manter
// presença em background") — só esconde. O processo só termina de
// verdade pelo item "Encerrar" da bandeja (ver tray.ts, `app.exit()`).

import { BrowserWindow } from "electron";
import path from "node:path";

let mainWindow: BrowserWindow | null = null;

export function createMainWindow(): BrowserWindow {
  if (mainWindow) return mainWindow;

  mainWindow = new BrowserWindow({
    width: 400,
    height: 460,
    resizable: false,
    show: false,
    title: "Presence Desktop Agent — Status",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  mainWindow.on("close", (event) => {
    event.preventDefault();
    mainWindow?.hide();
  });

  return mainWindow;
}

export function showMainWindow(): void {
  mainWindow?.show();
  mainWindow?.focus();
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
