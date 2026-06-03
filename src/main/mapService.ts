import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import electron from 'electron';
import { getLocalMapRotation, type RotationResponse } from '../shared/mapRotation';
import { getPlaceholderRankedStats, type RankedStatsResponse, type RankedStatsData } from '../shared/rankedStats';

const { BrowserWindow, app } = electron;

const TRACKER_PC_LEADERBOARD_URL = 'https://apex.tracker.gg/apex/leaderboards/stats/origin/RankScore?legend=all&type=stats';
const TRACKER_TEXT_READY_KEYWORDS = ['Master/Predator', 'Predator Cutoff'];
const RANKED_STATS_CACHE_TTL_MS = 5 * 60_000;
const PAGE_LOAD_TIMEOUT_MS = 20_000;
const PAGE_POLL_INTERVAL_MS = 750;
const PAGE_POLL_ATTEMPTS = 20;
const PREDATOR_PLAYERS_PC = 750;

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
      const apiKey = getTrackerApiKey();
      if (!apiKey) {
        const placeholder = {
          data: getPlaceholderRankedStats(new Date()),
          error: 'Missing Tracker.gg API key.',
          isStale: false
        } satisfies RankedStatsResponse;
        rankedStatsCache = placeholder;
        rankedStatsCacheAt = Date.now();
        return placeholder;
      }

      const data = await scrapeTrackerLeaderboard();
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

function getTrackerApiKey(): string | null {
  const direct = process.env.TRACKER_GG_API_KEY?.trim();
  if (direct) return direct;

  const legacyFilePath = join(app.getAppPath(), 'taggapi.env');
  if (!existsSync(legacyFilePath)) return null;

  const lines = readFileSync(legacyFilePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = lines[index];
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function scrapeTrackerLeaderboard(): Promise<RankedStatsData> {
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    const pageReady = waitForPageLoad(window);
    void window.loadURL(TRACKER_PC_LEADERBOARD_URL, {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
    });

    await withTimeout(pageReady, PAGE_LOAD_TIMEOUT_MS, 'Tracker.gg leaderboard page load timed out.');
    const pageText = await pollLeaderboardText(window);
    return parseTrackerLeaderboard(pageText);
  } finally {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  }
}

function waitForPageLoad(window: Electron.BrowserWindow): Promise<void> {
  return new Promise((resolve, reject) => {
    const webContents = window.webContents;
    const cleanup = (): void => {
      webContents.removeListener('did-finish-load', handleLoad);
      webContents.removeListener('did-fail-load' as never, handleFail as never);
    };

    const handleLoad = (): void => {
      cleanup();
      resolve();
    };

    const handleFail = (_event: Event, _errorCode: number, errorDescription: string): void => {
      cleanup();
      reject(new Error(`Tracker.gg leaderboard failed to load: ${errorDescription}`));
    };

    webContents.once('did-finish-load', handleLoad);
    webContents.once('did-fail-load' as never, handleFail as never);
  });
}

async function pollLeaderboardText(window: Electron.BrowserWindow): Promise<string> {
  for (let attempt = 0; attempt < PAGE_POLL_ATTEMPTS; attempt += 1) {
    const text = await window.webContents.executeJavaScript(
      "document.body?.innerText ?? ''",
      true
    );

    if (
      typeof text === 'string' &&
      TRACKER_TEXT_READY_KEYWORDS.every((keyword) => text.includes(keyword))
    ) {
      return text;
    }

    await delay(PAGE_POLL_INTERVAL_MS);
  }

  throw new Error('Tracker.gg leaderboard content did not become ready in time.');
}

function parseTrackerLeaderboard(pageText: string): RankedStatsData {
  const masterPlayers = extractTrackerNumber(pageText, /Master\/Predator\s+([\d,]+)\s+players/i, 'Master/Predator');
  const predatorCutoffRp = extractTrackerNumber(pageText, /Predator Cutoff\s+([\d,]+)\s+RP/i, 'Predator Cutoff');

  return {
    masterPlayers,
    predatorPlayers: PREDATOR_PLAYERS_PC,
    predatorCutoffRp,
    fetchedAt: new Date().toISOString(),
    isPlaceholder: false
  };
}

function extractTrackerNumber(source: string, pattern: RegExp, label: string): number {
  const match = source.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Unable to parse ${label} from Tracker.gg leaderboard.`);
  }

  return Number(match[1].replace(/,/g, ''));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), ms);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
