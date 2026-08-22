// Presence Desktop Agent — Fase 10G: notificação local (Nível 1, sem IA).
//
// Usa a própria `Notification` API do Electron (Notification Manager
// da arquitetura aprovada) — nenhuma lib nova, nenhuma dependência de
// rede.

import { Notification } from "electron";

import { registerTool } from "./registry";

function showNotification(args: { title: string; body: string }): Promise<{ shown: boolean }> {
  if (!Notification.isSupported()) return Promise.resolve({ shown: false });
  new Notification({ title: args.title, body: args.body }).show();
  return Promise.resolve({ shown: true });
}

registerTool({
  name: "show_notification",
  riskTier: "reversible",
  description: "Mostra uma notificação local do sistema operacional.",
  run: (args: { title: string; body: string }) => showNotification(args),
});
