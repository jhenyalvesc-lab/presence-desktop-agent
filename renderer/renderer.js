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
const clapStatusEl = document.getElementById("clap-status");
const clapLastEl = document.getElementById("clap-last");
const voiceStateEl = document.getElementById("voice-state");
const voiceLastCommandEl = document.getElementById("voice-last-command");
const confirmationCard = document.getElementById("confirmation-card");
const confirmationDescription = document.getElementById("confirmation-description");
const confirmationApprove = document.getElementById("confirmation-approve");
const confirmationDeny = document.getElementById("confirmation-deny");
const auditLogEl = document.getElementById("audit-log");
const schedulerStatusEl = document.getElementById("scheduler-status");
const commandQueueStatusEl = document.getElementById("command-queue-status");
const commandQueueHistoryEl = document.getElementById("command-queue-history");

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
  clapStatusEl.textContent = status.clap === "listening" ? "ouvindo por duas palmas" : "duas palmas desativadas (PRESENCE_CLAP_ENABLED=false)";
}

window.presenceAgent.onAudioStatus(renderAudioStatus);
window.presenceAgent.onWakeDetected(({ at }) => {
  wakeLastEl.textContent = `Última detecção: ${new Date(at).toLocaleTimeString()}`;
});
window.presenceAgent.onClapDetected(({ at }) => {
  clapLastEl.textContent = `Última detecção: ${new Date(at).toLocaleTimeString()}`;
});

const VOICE_STATE_LABELS = {
  idle: "ociosa",
  listening: "ouvindo o comando...",
  error: "não entendi — tente de novo",
};

window.presenceAgent.onVoiceState((state) => {
  voiceStateEl.textContent = VOICE_STATE_LABELS[state] ?? state;
});
window.presenceAgent.onCommandCaptured(({ transcript }) => {
  voiceLastCommandEl.textContent = `Último comando ouvido: "${transcript}"`;
});
window.presenceAgent.onCommandResolved((resolution) => {
  if (!resolution.matched) return;
  const outcome = resolution.ok ? `abriu ${resolution.label}` : `falhou ao abrir ${resolution.label} (${resolution.error})`;
  voiceLastCommandEl.textContent += ` — ${outcome}`;
});

let pendingConfirmationId = null;

window.presenceAgent.onConfirmationRequest((request) => {
  pendingConfirmationId = request.id;
  confirmationDescription.textContent = `${request.description} (nível: ${request.riskTier})`;
  confirmationCard.style.display = "block";
});

function respond(approved) {
  if (!pendingConfirmationId) return;
  window.presenceAgent.respondToConfirmation(pendingConfirmationId, approved);
  pendingConfirmationId = null;
  confirmationCard.style.display = "none";
}

confirmationApprove.addEventListener("click", () => respond(true));
confirmationDeny.addEventListener("click", () => respond(false));

const AUDIT_OUTCOME_LABELS = {
  success: "sucesso",
  denied: "negado",
  error: "erro",
  not_found: "ferramenta desconhecida",
};

function renderAuditEntry(entry) {
  const el = document.createElement("div");
  el.className = "audit-entry";
  const time = new Date(entry.at).toLocaleTimeString();
  el.textContent = `${time} — ${entry.tool} (${entry.riskTier}) — ${AUDIT_OUTCOME_LABELS[entry.outcome] ?? entry.outcome}`;
  auditLogEl.prepend(el);
}

window.presenceAgent.onAuditAppended(renderAuditEntry);

function renderJobStatus(status) {
  let el = document.getElementById(`job-${status.id}`);
  if (!el) {
    el = document.createElement("div");
    el.id = `job-${status.id}`;
    el.className = "audit-entry";
    schedulerStatusEl.appendChild(el);
  }
  const last = status.lastRunAt ? `última: ${new Date(status.lastRunAt).toLocaleTimeString()} (${status.lastRunOk ? "ok" : `falhou — ${status.lastError}`})` : "ainda não rodou";
  const next = status.nextRunAt ? `próxima: ${new Date(status.nextRunAt).toLocaleTimeString()}` : "";
  el.textContent = `${status.id} (${status.cronExpression}) — ${last} — ${next}`;
}

window.presenceAgent.onSchedulerStatus(renderJobStatus);

const COMMAND_QUEUE_STATUS_LABELS = {
  idle: "ociosa (nada pendente)",
  polling: "verificando a fila...",
  error: "erro ao verificar a fila",
};

window.presenceAgent.onCommandQueueStatus(({ status, detail }) => {
  const label = COMMAND_QUEUE_STATUS_LABELS[status] ?? status;
  commandQueueStatusEl.textContent = detail ? `${label} (${detail})` : label;
});

window.presenceAgent.onCommandQueueReceived(({ text }) => {
  const el = document.createElement("div");
  el.className = "audit-entry";
  el.textContent = `${new Date().toLocaleTimeString()} — comando recebido: "${text}"`;
  commandQueueHistoryEl.prepend(el);
});

window.presenceAgent.onCommandQueueCompleted(({ text, status }) => {
  const el = document.createElement("div");
  el.className = "audit-entry";
  el.textContent = `${new Date().toLocaleTimeString()} — "${text}" — ${status === "done" ? "concluído" : "falhou"}`;
  commandQueueHistoryEl.prepend(el);
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

  const auditLog = await window.presenceAgent.getAuditLog();
  for (const entry of auditLog) renderAuditEntry(entry);

  const schedulerStatus = await window.presenceAgent.getSchedulerStatus();
  for (const status of schedulerStatus) renderJobStatus(status);
})();
