// Presence Desktop Agent — Fase 10E: proteção contra travamento.
//
// Descoberta real durante a validação desta fase: `screenshot-desktop`
// trava (nunca resolve nem rejeita) neste sandbox quando as
// ferramentas de linha de comando do X11 que ele depende (`xrandr`
// etc.) não existem — em vez de falhar rápido. Como não dá pra provar
// que o Windows real nunca vai ter uma falha equivalente (driver
// gráfico, permissão negada), qualquer tool que dependa de captura de
// tela/processos externos passa por este limite de tempo — nunca
// trava a interação por voz inteira por causa de uma única ferramenta.

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, toolName: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`presence-agent/tool-timeout:${toolName}`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
