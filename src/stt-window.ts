// Presence Desktop Agent — Fase 10D: STT Renderer.
//
// `BrowserWindow` oculta dedicada (arquitetura aprovada), reaproveita a
// Web Speech API do próprio Chromium embutido no Electron — exceção
// explícita e temporária ao Local-First (o áudio desse reconhecimento
// vai para os servidores do Google), já prevista na auditoria da Fase
// 10. Risco adicional, descoberto durante esta implementação e não
// coberto pela auditoria original: builds "unbranded" do Chromium
// (como o do Electron) costumam não ter a chave de API do Google que
// esse serviço depende pra funcionar de verdade — pode simplesmente
// falhar em produção. Só um teste real no Windows confirma; se
// falhar, a alternativa já prevista na arquitetura é Whisper local
// (`whisper.cpp`), fica para quando isso for confirmado.

import { BrowserWindow, ipcMain, type IpcMainEvent } from "electron";
import path from "node:path";

export type SttResult = { status: "ok"; transcript: string } | { status: "error"; code: string } | { status: "timeout" };

const LISTEN_TIMEOUT_MS = 8000;

let sttWindow: BrowserWindow | null = null;

function getSttWindow(): BrowserWindow {
  if (sttWindow) return sttWindow;

  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "renderer", "stt-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Electron bloqueia permissões de mídia (microfone) por padrão — sem
  // isso, `recognition.start()` na página nunca chegaria a capturar
  // áudio. Escopado só a esta janela (por `webContents.id`), nunca
  // concedido globalmente a qualquer outra janela do agente.
  window.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === "media" && webContents.id === window.webContents.id);
  });

  void window.loadFile(path.join(__dirname, "..", "renderer", "stt.html"));

  sttWindow = window;
  return window;
}

/** Abre uma única janela de escuta e devolve o resultado (transcrito, erro, ou timeout local). Só uma captura por vez — quem chama é responsável por não sobrepor (ver `voice-interaction.ts`). */
export async function captureVoiceCommand(): Promise<SttResult> {
  const window = getSttWindow();

  return new Promise((resolve) => {
    let settled = false;

    const finish = (result: SttResult): void => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener("stt:result", onResult);
      clearTimeout(timer);
      resolve(result);
    };

    const onResult = (_event: IpcMainEvent, payload: SttResult): void => finish(payload);
    ipcMain.on("stt:result", onResult);

    const timer = setTimeout(() => finish({ status: "timeout" }), LISTEN_TIMEOUT_MS);

    window.webContents.send("stt:start");
  });
}
