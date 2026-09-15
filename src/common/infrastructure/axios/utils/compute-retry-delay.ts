export interface ComputeRetryDelayWithJitterParams {
  retryCount: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const computeRetryDelayWithJitter = ({
  retryCount,
  baseDelayMs,
  maxDelayMs,
}: ComputeRetryDelayWithJitterParams): number => {
  const attempt = Math.max(0, retryCount - 1);
  const backoff = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  const jitter =
    Math.random() * Math.max(0, Math.min(baseDelayMs, maxDelayMs - backoff));
  return Math.round(backoff + jitter);
};
