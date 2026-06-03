import { app } from 'electron';
import { getLocalMapRotation, type RotationResponse } from '../shared/mapRotation';
import { getPlaceholderRankedStats, type RankedStatsResponse, type RankedStatsData } from '../shared/rankedStats';

const LOCAL_WORKER_URL = 'http://127.0.0.1:8787/ranked-stats';
const PRODUCTION_WORKER_URL = 'https://apex-tracker-proxy.mmfan404.workers.dev/ranked-stats';
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
      const workerUrl = resolveRankedStatsWorkerUrl();
      if (!workerUrl) {
        const placeholder = {
          data: getPlaceholderRankedStats(new Date()),
          error: 'Missing ranked stats Worker URL.',
          isStale: false
        } satisfies RankedStatsResponse;
        rankedStatsCache = placeholder;
        rankedStatsCacheAt = Date.now();
        return placeholder;
      }

      const data = await fetchRankedStatsFromWorker(workerUrl);
      const nextResponse = {
        data,
        error: null,
        isStale: false
      } satisfies RankedStatsResponse;
      rankedStatsCache = nextResponse;
      rankedStatsCacheAt = Date.now();
      return nextResponse;
    } catch (error) {
      if (rankedStatsCache?.data) {
        return {
          data: rankedStatsCache.data,
          error: error instanceof Error ? error.message : 'Failed to load Tracker.gg ranked stats.',
          isStale: true
        } satisfies RankedStatsResponse;
      }

      const placeholder = {
        data: getPlaceholderRankedStats(new Date()),
        error: error instanceof Error ? error.message : 'Failed to load Tracker.gg ranked stats.',
        isStale: false
      } satisfies RankedStatsResponse;
      rankedStatsCache = placeholder;
      rankedStatsCacheAt = Date.now();
      return placeholder;
    } finally {
      rankedStatsInFlight = null;
    }
  })();

  return rankedStatsInFlight;
}

function resolveRankedStatsWorkerUrl(): string {
  const direct = process.env.RANKED_STATS_WORKER_URL?.trim();
  if (direct) return direct;

  if (!app.isPackaged) {
    return LOCAL_WORKER_URL;
  }

  return PRODUCTION_WORKER_URL;
}

async function fetchRankedStatsFromWorker(workerUrl: string): Promise<RankedStatsData> {
  const response = await fetch(workerUrl, {
    headers: {
      accept: 'application/json'
    },
    signal: AbortSignal.timeout(WORKER_REQUEST_TIMEOUT_MS)
  });

  const payload = (await response.json()) as Partial<RankedStatsData> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? `Ranked stats Worker request failed with status ${response.status}.`);
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
