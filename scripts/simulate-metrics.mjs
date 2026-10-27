import 'dotenv/config';
import { parseArgs } from 'node:util';

// Gia lap cam bien nhip tim/toc do gan tren ngua: moi giay gui 1 diem do
// cho mot luot tap dang ONGOING. Dung khi luot khong con ONGOING (409) hoac Ctrl+C.
//   pnpm sim --participant <id>
//   pnpm sim --participant <id> --spike-at 30          # giay 30-34 nhip tim 245 (CRITICAL)
//   pnpm sim --participant <id> --duration 120 --base-url http://localhost:3000/api/v1

const { values } = parseArgs({
  options: {
    participant: { type: 'string' },
    'base-url': { type: 'string' },
    source: { type: 'string', default: 'sim-sensor-1' },
    interval: { type: 'string', default: '1000' },
    duration: { type: 'string' },
    'spike-at': { type: 'string' },
  },
});

if (!values.participant) {
  console.error('Thieu --participant <sessionParticipantId>');
  process.exit(1);
}

const baseUrl = (
  values['base-url'] ?? `http://localhost:${process.env.PORT ?? 3000}/api/v1`
).replace(/\/$/, '');
const url = `${baseUrl}/session-participants/${values.participant}/metrics`;
const intervalMs = Number(values.interval);
const duration = values.duration ? Number(values.duration) : Infinity;
const spikeAt = values['spike-at'] ? Number(values['spike-at']) : null;

const jitter = (amount) => (Math.random() * 2 - 1) * amount;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Khoi dong 60 giay dau: nhip tim 90 -> 180, toc do 2 -> 12 m/s, sau do dao dong quanh muc do.
const sample = (second) => {
  const warmup = Math.min(1, second / 60);
  if (spikeAt !== null && second >= spikeAt && second < spikeAt + 5) {
    return { heartRateBpm: 245, speedMps: 16 + jitter(1) };
  }
  return {
    heartRateBpm: Math.round(clamp(90 + 90 * warmup + jitter(6), 60, 300)),
    speedMps: clamp(2 + 10 * warmup + jitter(0.8), 0, 30),
  };
};

let second = 0;
let stopped = false;
process.on('SIGINT', () => {
  stopped = true;
});

console.log(`Gui diem do toi ${url} (Ctrl+C de dung)`);
while (!stopped && second < duration) {
  const { heartRateBpm, speedMps } = sample(second);
  const body = {
    sourceId: values.source,
    recordedAt: new Date().toISOString(),
    heartRateBpm,
    speedMps: Number(speedMps.toFixed(3)),
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[${second}s] ${res.status} ${text}`);
      if (res.status === 404 || res.status === 409) break;
    } else {
      const { highestAlertLevel } = JSON.parse(text);
      console.log(
        `[${second}s] ${heartRateBpm} bpm, ${body.speedMps} m/s -> ${highestAlertLevel}`,
      );
    }
  } catch (error) {
    console.error(`[${second}s] Khong gui duoc: ${error.message}`);
  }
  second += 1;
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
console.log(`Da dung sau ${second} diem do`);
