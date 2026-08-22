// Presence Desktop Agent — Fase A: iniciar com o Windows.
//
// API nativa do Electron (`app.setLoginItemSettings`) — nenhuma
// dependência extra. `openAsHidden: true` evita que a janela apareça
// sozinha no login; o Tray continua acessível normalmente.

import { app } from "electron";

export function setAutostart(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
}

export function isAutostartEnabled(): boolean {
  return app.getLoginItemSettings().openAtLogin;
}
