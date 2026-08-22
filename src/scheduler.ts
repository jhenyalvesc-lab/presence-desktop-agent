// Presence Desktop Agent — Fase 10G: Scheduler.
//
// `node-cron` dentro do Main Process, exatamente como a arquitetura
// pede: "100% local e determinístico pra disparar as automações — o
// que a automação FAZ ao disparar é que pode (ou não) precisar de IA,
// o disparo em si nunca precisa." Este módulo só cuida do disparo;
// cada job decide sozinho o que fazer quando disparado.

import cron, { type ScheduledTask } from "node-cron";

export interface JobStatus {
  id: string;
  cronExpression: string;
  lastRunAt: string | null;
  lastRunOk: boolean | null;
  lastError: string | null;
  nextRunAt: string | null;
}

interface JobEntry {
  task: ScheduledTask;
  status: JobStatus;
}

type StatusListener = (status: JobStatus) => void;

const jobs = new Map<string, JobEntry>();
const statusListeners = new Set<StatusListener>();

export function onJobStatusChanged(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function getJobStatuses(): JobStatus[] {
  return Array.from(jobs.values()).map((entry) => entry.status);
}

/** Agenda um job. Lança se `cronExpression` for inválida — nunca agenda algo que o node-cron não entende. */
export function scheduleJob(id: string, cronExpression: string, handler: () => Promise<void> | void): void {
  if (jobs.has(id)) throw new Error(`presence-agent/job-already-scheduled:${id}`);
  if (!cron.validate(cronExpression)) throw new Error(`presence-agent/invalid-cron-expression:${cronExpression}`);

  const status: JobStatus = {
    id,
    cronExpression,
    lastRunAt: null,
    lastRunOk: null,
    lastError: null,
    nextRunAt: null,
  };

  const task = cron.schedule(cronExpression, () => runJob(id, handler));
  jobs.set(id, { task, status });
  updateNextRun(id);
}

export function cancelJob(id: string): void {
  const entry = jobs.get(id);
  if (!entry) return;
  void entry.task.destroy();
  jobs.delete(id);
}

async function runJob(id: string, handler: () => Promise<void> | void): Promise<void> {
  const entry = jobs.get(id);
  if (!entry) return;

  try {
    await handler();
    entry.status.lastRunOk = true;
    entry.status.lastError = null;
  } catch (error) {
    entry.status.lastRunOk = false;
    entry.status.lastError = error instanceof Error ? error.message : String(error);
  }

  entry.status.lastRunAt = new Date().toISOString();
  updateNextRun(id);
  for (const listener of statusListeners) listener(entry.status);
}

function updateNextRun(id: string): void {
  const entry = jobs.get(id);
  if (!entry) return;
  const next = entry.task.getNextRun();
  entry.status.nextRunAt = next ? next.toISOString() : null;
}
