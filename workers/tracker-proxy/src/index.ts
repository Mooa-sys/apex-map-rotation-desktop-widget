export interface Env {
  TRACKER_GG_API_KEY: string;
}

const TRACKER_PREDATOR_INSIGHTS_URL =
  'https://api.tracker.gg/api/v1/apex/insights/predator-insights?mode=1&platformSlug=origin';
const TRACKER_DISTRIBUTION_URL =
  'https://api.tracker.gg/api/v1/apex/insights/distribution?platform=origin&field=RankScore';
const APEX_RANKED_HOME_URL = 'https://apexranked.com/';
const PC_PREDATOR_SLOTS = 750;
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type'
} as const;

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
      ...CORS_HEADERS,
      ...init?.headers
    }
  });
}

function parseFormattedNumber(value: string): number {
  return Number(value.replace(/,/g, ''));
}

function extractFirstMatch(html: string, patterns: RegExp[], fieldName: string): string {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    const value = match?.[1]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(`Failed to parse ${fieldName} from apexranked.com.`);
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`Apex Ranked request failed with status ${response.status} for ${url}.`);
  }

  return response.text();
}

async function fetchApexRankedStats(): Promise<{
  masterPlayers: number;
  predatorPlayers: number;
  predatorCutoffRp: number;
  fetchedAt: string;
  source: string;
}> {
  const homeHtml = await fetchHtml(APEX_RANKED_HOME_URL);

  const estimatedMasterPlayers = parseFormattedNumber(
    extractFirstMatch(
      homeHtml,
      [
        /<span>\s*Estimated masters players\s*<\/span>\s*<strong>\s*([\d,]+)\s*<\/strong>/i,
        /Estimated masters players[\s\S]{0,120}?<strong>\s*([\d,]+)\s*<\/strong>/i
      ],
      'estimated masters players'
    )
  );

  const predatorCutoffRp = parseFormattedNumber(
    extractFirstMatch(
      homeHtml,
      [
        /<span>\s*Pred cutoff\s*<\/span>\s*<strong>\s*([\d,]+)\s*<\/strong>/i,
        /Pred cutoff[\s\S]{0,120}?<strong>\s*([\d,]+)\s*<\/strong>/i
      ],
      'predator cutoff'
    )
  );

  return {
    // The page reports estimated Master players separately from the fixed Predator ladder size.
    masterPlayers: estimatedMasterPlayers + PC_PREDATOR_SLOTS,
    predatorPlayers: PC_PREDATOR_SLOTS,
    predatorCutoffRp,
    fetchedAt: new Date().toISOString(),
    source: 'apexranked.com'
  };
}

async function fetchRankedStats(env: Env): Promise<{
  masterPlayers: number;
  predatorPlayers: number;
  predatorCutoffRp: number;
  fetchedAt: string;
  source: string;
}> {
  if (!env.TRACKER_GG_API_KEY) {
    return fetchApexRankedStats();
  }

  const commonHeaders = {
    'TRN-Api-Key': env.TRACKER_GG_API_KEY,
    accept: 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
    origin: 'https://apex.tracker.gg',
    referer: 'https://apex.tracker.gg/'
  };

  const [predatorResponse, distributionResponse] = await Promise.all([
    fetch(TRACKER_PREDATOR_INSIGHTS_URL, { headers: commonHeaders }),
    fetch(TRACKER_DISTRIBUTION_URL, { headers: commonHeaders })
  ]);

  if (!predatorResponse.ok) {
    throw new Error(`Tracker predator insights failed with status ${predatorResponse.status}.`);
  }

  if (!distributionResponse.ok) {
    throw new Error(`Tracker distribution failed with status ${distributionResponse.status}.`);
  }

  const predatorJson = (await predatorResponse.json()) as {
    data?: {
      rankScoreNeeded?: number;
      masterOrAboveCount?: number;
    };
  };
  const distributionJson = (await distributionResponse.json()) as {
    data?: Array<{
      tier?: string;
      count?: number;
    }>;
  };

  const masterPlayers = predatorJson.data?.masterOrAboveCount;
  const predatorCutoffRp = predatorJson.data?.rankScoreNeeded;
  const predatorPlayers = distributionJson.data?.find((item) => item.tier === 'Predator')?.count;

  if (
    typeof masterPlayers !== 'number' ||
    typeof predatorCutoffRp !== 'number' ||
    typeof predatorPlayers !== 'number'
  ) {
    throw new Error('Tracker insights response is missing required ranked stats fields.');
  }

  return {
    masterPlayers,
    predatorPlayers,
    predatorCutoffRp,
    fetchedAt: new Date().toISOString(),
    source: 'tracker.gg'
  };
}

async function fetchRankedStatsWithFallback(env: Env): Promise<{
  masterPlayers: number;
  predatorPlayers: number;
  predatorCutoffRp: number;
  fetchedAt: string;
  source: string;
}> {
  try {
    return await fetchRankedStats(env);
  } catch (trackerError) {
    try {
      return await fetchApexRankedStats();
    } catch (fallbackError) {
      const trackerMessage =
        trackerError instanceof Error ? trackerError.message : 'Unknown tracker.gg error.';
      const fallbackMessage =
        fallbackError instanceof Error ? fallbackError.message : 'Unknown apexranked.com error.';

      throw new Error(
        `tracker.gg failed: ${trackerMessage}; apexranked.com fallback failed: ${fallbackMessage}`
      );
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    if (url.pathname === '/ranked-stats') {
      try {
        const data = await fetchRankedStatsWithFallback(env);
        return json(data);
      } catch (error) {
        return json(
          {
            error: error instanceof Error ? error.message : 'Unknown Worker error.'
          },
          { status: 502 }
        );
      }
    }

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'apex-tracker-proxy'
      });
    }

    return json(
      {
        message: 'Available endpoints: /ranked-stats, /health'
      },
      { status: 404 }
    );
  }
};
