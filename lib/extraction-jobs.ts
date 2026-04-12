import type { ExtractionResponse } from "@/lib/types";

export type ExtractionJobStatus = "queued" | "running" | "completed" | "failed";

export type ExtractionJobSnapshot = {
  id: string;
  status: ExtractionJobStatus;
  progress: number;
  stage: string;
  totalFiles: number;
  processedFiles: number;
  totalSteps: number;
  currentStep: number;
  logs: string[];
  result: ExtractionResponse | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
};

type ExtractionJob = ExtractionJobSnapshot;

const jobs = new Map<string, ExtractionJob>();
const MAX_LOGS = 200;

export function createExtractionJob(options?: { totalFiles?: number; totalSteps?: number }) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const job: ExtractionJob = {
    id,
    status: "queued",
    progress: 0,
    stage: "대기 중",
    totalFiles: options?.totalFiles ?? 0,
    processedFiles: 0,
    totalSteps: options?.totalSteps ?? 0,
    currentStep: 0,
    logs: [`[${formatTimestamp(now)}] 작업이 생성되었습니다.`],
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now
  };

  jobs.set(id, job);
  pruneOldJobs();
  return getExtractionJob(id)!;
}

export function getExtractionJob(id: string) {
  const job = jobs.get(id);
  if (!job) {
    return null;
  }

  return structuredClone(job);
}

export function updateExtractionJob(
  id: string,
  update: Partial<
    Pick<
      ExtractionJob,
      | "status"
      | "progress"
      | "stage"
      | "result"
      | "error"
      | "processedFiles"
      | "totalFiles"
      | "currentStep"
      | "totalSteps"
    >
  >
) {
  const job = jobs.get(id);
  if (!job) {
    return;
  }

  if (update.status !== undefined) {
    job.status = update.status;
  }
  if (update.progress !== undefined) {
    job.progress = clampProgress(update.progress);
  }
  if (update.stage !== undefined) {
    job.stage = update.stage;
  }
  if (update.totalFiles !== undefined) {
    job.totalFiles = update.totalFiles;
  }
  if (update.processedFiles !== undefined) {
    job.processedFiles = Math.max(0, Math.min(update.processedFiles, job.totalFiles || update.processedFiles));
  }
  if (update.totalSteps !== undefined) {
    job.totalSteps = Math.max(0, update.totalSteps);
  }
  if (update.currentStep !== undefined) {
    job.currentStep = Math.max(0, Math.min(update.currentStep, job.totalSteps || update.currentStep));
  }
  if (update.result !== undefined) {
    job.result = update.result;
  }
  if (update.error !== undefined) {
    job.error = update.error;
  }

  job.updatedAt = Date.now();
}

export function appendExtractionJobLog(id: string, message: string) {
  const job = jobs.get(id);
  if (!job) {
    return;
  }

  job.logs.push(`[${formatTimestamp(Date.now())}] ${message}`);
  if (job.logs.length > MAX_LOGS) {
    job.logs.splice(0, job.logs.length - MAX_LOGS);
  }
  job.updatedAt = Date.now();
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function pruneOldJobs() {
  const threshold = Date.now() - 1000 * 60 * 60;
  for (const [id, job] of jobs.entries()) {
    if (job.updatedAt < threshold) {
      jobs.delete(id);
    }
  }
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("ko-KR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
