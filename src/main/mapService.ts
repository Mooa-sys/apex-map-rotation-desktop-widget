import { app, net } from 'electron';
import { getLocalMapRotation, type RotationResponse } from '../shared/mapRotation';
import { type RankedStatsResponse, type RankedStatsData } from '../shared/rankedStats';

const LOCAL_WORKER_URL = 'http://127.0.0.1:8787/ranked-stats';
const PRODUCTION_CLOUDFLARE_WORKER_URL = 'https://apex-tracker-proxy.mmfan404.workers.dev/ranked-stats';
const PRODUCTION_ALIYUN_FC_WORKER_URL = 'https://apex-map-exhidqgabr.cn-shenzhen.fcapp.run/ranked-stats';
const RANKED_STATS_CACHE_TTL_MS = 5 * 60_000;
const WORKER_REQUEST_TIMEOUT_MS = 10_000;

let rankedStatsCache: RankedStatsResponse | null = null;
let rankedStatsCacheAt = 0;
let rankedStatsInFlight: Promise<RankedStatsResponse> | null = null;

export async function getMapRotation(_force = false): Promise<RotationResponse> {
  return {
    data: getLocalMapRotation(new Date()),
    error: null,
    isStale: false
  };
}

export async function getRankedStats(force = false): Promise<RankedStatsResponse> {
  const cached = rankedStatsCache;
  const isCacheFresh = cached && Date.now() - rankedStatsCacheAt < RANKED_STATS_CACHE_TTL_MS;
  if (!force && isCacheFresh) {
    return cached;
  }

  if (rankedStatsInFlight) {
    return rankedStatsInFlight;
  }

  rankedStatsInFlight = (async () => {
    try {
      const workerUrls = resolveRankedStatsWorkerUrls();
      if (workerUrls.length === 0) {
        return {
          data: null,
          error: 'Missing ranked stats Worker URL.',
          isStale: false
        } satisfies RankedStatsResponse;
      }

      const data = await fetchRankedStatsFromWorkerUrls(workerUrls);
      const nextResponse = {
        data,
        error: null,
        isStale: false
      } satisfies RankedStatsResponse;
      rankedStatsCache = nextResponse;
      rankedStatsCacheAt = Date.now();
      return nextResponse;
    } catch (error) {
      if (force && isCacheFresh && rankedStatsCache) {
        return {
          data: rankedStatsCache.data,
          error: null,
          isStale: false
        } satisfies RankedStatsResponse;
      }

      if (rankedStatsCache?.data) {
        return {
          data: rankedStatsCache.data,
          error: error instanceof Error ? error.message : 'Failed to load Tracker.gg ranked stats.',
          isStale: true
        } satisfies RankedStatsResponse;
      }

      return {
        data: null,
        error: error instanceof Error ? error.message : 'Failed to load Tracker.gg ranked stats.',
        isStale: false
      } satisfies RankedStatsResponse;
    } finally {
      rankedStatsInFlight = null;
    }
  })();

  return rankedStatsInFlight;
}

function parseRankedStatsWorkerUrls(value: string): string[] {
  return value
    .split(/[\r\n,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => /^https?:\/\//i.test(entry));
}

function resolveRankedStatsWorkerUrls(): string[] {
  const direct = process.env.RANKED_STATS_WORKER_URL?.trim();
  if (direct) return parseRankedStatsWorkerUrls(direct);

  if (!app.isPackaged) {
    return [LOCAL_WORKER_URL];
  }

  return [PRODUCTION_CLOUDFLARE_WORKER_URL, PRODUCTION_ALIYUN_FC_WORKER_URL].filter((url) =>
    /^https?:\/\//i.test(url)
  );
}

async function fetchRankedStatsFromWorkerUrls(workerUrls: string[]): Promise<RankedStatsData> {
  const failures: string[] = [];

  for (const workerUrl of workerUrls) {
    try {
      return await fetchRankedStatsFromWorker(workerUrl);
    } catch (error) {
      failures.push(`${workerUrl}: ${error instanceof Error ? error.message : 'Unknown worker error.'}`);
    }
  }

  throw new Error(`All ranked stats Worker endpoints failed. ${failures.join(' | ')}`);
}

async function fetchRankedStatsFromWorker(workerUrl: string): Promise<RankedStatsData> {
  const response = await requestRankedStats(workerUrl);
  const payload = response.payload;

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(payload.error ?? `Ranked stats Worker request failed with status ${response.statusCode}.`);
  }

  if (
    typeof payload.masterPlayers !== 'number' ||
    typeof payload.predatorPlayers !== 'number' ||
    typeof payload.predatorCutoffRp !== 'number'
  ) {
    throw new Error('Ranked stats Worker returned an invalid payload.');
  }

  return {
    masterPlayers: payload.masterPlayers,
    predatorPlayers: payload.predatorPlayers,
    predatorCutoffRp: payload.predatorCutoffRp,
    fetchedAt: typeof payload.fetchedAt === 'string' ? payload.fetchedAt : new Date().toISOString(),
    isPlaceholder: false
  };
}

async function requestRankedStats(workerUrl: string): Promise<{
  statusCode: number;
  payload: Partial<RankedStatsData> & { error?: string };
}> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      url: workerUrl,
      method: 'GET'
    });
    let settled = false;

    request.setHeader('accept', 'application/json');

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      request.abort();
      reject(new Error(`Ranked stats Worker request timed out after ${WORKER_REQUEST_TIMEOUT_MS}ms.`));
    }, WORKER_REQUEST_TIMEOUT_MS);

    request.on('response', (response) => {
      const chunks: Buffer[] = [];

      response.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      response.on('end', () => {
        clearTimeout(timeoutId);
        if (settled) return;
        settled = true;

        const body = Buffer.concat(chunks).toString('utf8');
        if (!body) {
          resolve({
            statusCode: response.statusCode,
            payload: {}
          });
          return;
        }

        try {
          resolve({
            statusCode: response.statusCode,
            payload: JSON.parse(body) as Partial<RankedStatsData> & { error?: string }
          });
        } catch {
          reject(new Error('Ranked stats Worker returned invalid JSON.'));
        }
      });

      response.on('error', (error) => {
        clearTimeout(timeoutId);
        if (settled) return;
        settled = true;
        reject(error);
      });
    });

    request.on('error', (error) => {
      clearTimeout(timeoutId);
      if (settled) return;
      settled = true;
      reject(error);
    });

    request.end();
  });
}
