// Presence Desktop Agent — Fase 10F: ponte de confirmação Main ↔ UI.
//
// Quando uma ferramenta precisa de confirmação (`permission-manager.ts`
// decide isso), este módulo publica um pedido discreto pro Main exibir
// na janela de status e espera a resposta — nunca assume aprovação por
// timeout (nega por segurança) e nunca executa nada sozinho, só
// resolve/rejeita a promessa de quem pediu.

import { randomUUID } from "node:crypto";

export interface ConfirmationRequest {
  id: string;
  toolName: string;
  description: string;
  riskTier: string;
}

type RequestListener = (request: ConfirmationRequest) => void;

const CONFIRMATION_TIMEOUT_MS = 30_000;

const requestListeners = new Set<RequestListener>();
const pending = new Map<string, (approved: boolean) => void>();

export function onConfirmationRequested(listener: RequestListener): () => void {
  requestListeners.add(listener);
  return () => requestListeners.delete(listener);
}

export function respondToConfirmation(id: string, approved: boolean): void {
  const resolve = pending.get(id);
  if (!resolve) return;
  pending.delete(id);
  resolve(approved);
}

export function requestConfirmation(toolName: string, description: string, riskTier: string): Promise<boolean> {
  const id = randomUUID();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(false); // sem resposta dentro do prazo — nega, nunca assume aprovação
    }, CONFIRMATION_TIMEOUT_MS);

    pending.set(id, (approved) => {
      clearTimeout(timer);
      resolve(approved);
    });

    const request: ConfirmationRequest = { id, toolName, description, riskTier };
    for (const listener of requestListeners) listener(request);
  });
}
