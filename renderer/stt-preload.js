// Presence Desktop Agent — Fase 10D: ponte IPC do STT Renderer.
//
// Mesma disciplina de segurança das outras janelas (contextIsolation,
// sem nodeIntegration) — a página só enxerga o que este arquivo expõe.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sttBridge", {
  onStart: (callback) => ipcRenderer.on("stt:start", () => callback()),
  reportResult: (payload) => ipcRenderer.send("stt:result", payload),
});
