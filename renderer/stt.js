// Presence Desktop Agent — Fase 10D: captura de um único comando falado.
//
// JS puro, sem framework. Roda na janela oculta dedicada ao STT (ver
// `src/stt-window.ts`). Usa a Web Speech API do próprio Chromium
// embutido no Electron — exceção documentada e temporária ao
// Local-First (ver README/IMPLEMENTATION_STATE): o áudio desse
// reconhecimento vai para os servidores do Google, e builds
// "unbranded" do Chromium como o do Electron podem nem ter a chave de
// API que esse serviço depende — só um teste real confirma.

window.sttBridge.onStart(() => {
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    window.sttBridge.reportResult({ status: "error", code: "unsupported" });
    return;
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = "pt-BR";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let settled = false;
  const finish = (payload) => {
    if (settled) return;
    settled = true;
    window.sttBridge.reportResult(payload);
  };

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript ?? "";
    finish({ status: "ok", transcript });
  };
  recognition.onerror = (event) => {
    finish({ status: "error", code: event.error ?? "unknown" });
  };
  recognition.onend = () => {
    // Se `onresult` já resolveu, `finish` é um no-op (settled). Se
    // terminou sem resultado (silêncio/sem fala), é um erro "sem fala".
    finish({ status: "error", code: "no-speech" });
  };

  try {
    recognition.start();
  } catch (error) {
    finish({ status: "error", code: "start-failed" });
  }
});
