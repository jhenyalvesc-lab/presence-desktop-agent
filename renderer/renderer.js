// Presence Desktop Agent — Fase A: script da janela de status.
//
// JS puro, sem framework (nada de React/etc. nesta fase) — só chama
// `window.presenceAgent`, exposto pelo preload via contextBridge. Nunca
// tem acesso direto a Node/Electron.

const pairingIdle = document.getElementById("pairing-idle");
const pairingActive = document.getElementById("pairing-active");
const pairingCode = document.getElementById("pairing-code");
const pairingCountdown = document.getElementById("pairing-countdown");
const pairingStatus = document.getElementById("pairing-status");
const pairingCard = document.getElementById("pairing-card");
const pairedCard = document.getElementById("paired-card");
const deviceIdEl = document.getElementById("device-id");
const startPairingButton = document.getElementById("start-pairing");
const pingButton = document.getElementById("ping");
const pingResult = document.getElementById("ping-result");
const audioStatusEl = document.getElementById("audio-status");
const wakeLastEl = document.getElementById("wake-last");

const AUDIO_STATUS_LABELS = {
  idle: "iniciando...",
  starting: "iniciando o microfone...",
  listening: { not_configured: "microfone ativo — wake word não configurada", listening: 'ouvindo por "Presence"', error: "microfone ativo — wake word com erro" },
  stopped: "parado",
  error: "erro",
};

function renderAudioStatus(status) {
  const recorderLabel = AUDIO_STATUS_LABELS[status.recorder];
  const text = typeof recorderLabel === "object" ? recorderLabel[status.wakeWord] ?? recorderLabel.error : recorderLabel ?? status.recorder;
  audioStatusEl.textContent = status.detail ? `${text} (${status.detail})` : text;
}

window.presenceAgent.onAudioStatus(renderAudioStatus);
window.presenceAgent.onWakeDetected(({ at }) => {
  wakeLastEl.textContent = `Última detecção: ${new Date(at).toLocaleTimeString()}`;
});

function showPaired(deviceId) {
  pairingCard.style.display = "none";
  pairedCard.style.display = "block";
  deviceIdEl.textContent = deviceId;
}

function showUnpaired() {
  pairingCard.style.display = "block";
  pairedCard.style.display = "none";
  pairingIdle.style.display = "block";
  pairingActive.style.display = "none";
  pairingStatus.textContent = "";
}

window.presenceAgent.onPairingStarted(({ code }) => {
  pairingIdle.style.display = "none";
  pairingActive.style.display = "block";
  pairingCode.textContent = code;
});

window.presenceAgent.onPairingTick((secondsLeft) => {
  pairingCountdown.textContent = `expira em ${secondsLeft}s`;
});

startPairingButton.addEventListener("click", async () => {
  startPairingButton.disabled = true;
  pairingStatus.textContent = "";
  try {
    const result = await window.presenceAgent.startPairing();
    if (result.status === "ready") {
      showPaired(result.deviceId);
    } else {
      pairingStatus.textContent = "Código expirado. Tente parear de novo.";
      showUnpaired();
    }
  } catch (error) {
    pairingStatus.textContent = `Não foi possível parear: ${error.message ?? error}`;
    showUnpaired();
  } finally {
    startPairingButton.disabled = false;
  }
});

pingButton.addEventListener("click", async () => {
  pingButton.disabled = true;
  pingResult.textContent = "Enviando ping...";
  try {
    const result = await window.presenceAgent.ping();
    pingResult.textContent = `OK — servidor respondeu em ${result.serverTime}`;
  } catch (error) {
    pingResult.textContent = `Falhou: ${error.message ?? error}`;
  } finally {
    pingButton.disabled = false;
  }
});

(async () => {
  const status = await window.presenceAgent.getStatus();
  if (status.paired) {
    showPaired(status.deviceId);
  } else {
    showUnpaired();
  }

  const audioStatus = await window.presenceAgent.getAudioStatus();
  renderAudioStatus(audioStatus);
})();
