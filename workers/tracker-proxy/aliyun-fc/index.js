const http = require('node:http');

const TRACKER_PREDATOR_INSIGHTS_URL =
  'https://api.tracker.gg/api/v1/apex/insights/predator-insights?mode=1&platformSlug=origin';
const TRACKER_DISTRIBUTION_URL =
  'https://api.tracker.gg/api/v1/apex/insights/distribution?platform=origin&field=RankScore';
const APEX_RANKED_HOME_URL = 'https://apexranked.com/';
const PC_PREDATOR_SLOTS = 750;
const PORT = Number(process.env.PORT || 9000);
const CACHE_CONTROL_HEADER = 'public, max-age=300';
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type'
};

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': CACHE_CONTROL_HEADER,
    ...CORS_HEADERS
  });
  response.end(JSON.stringify(payload, null, 2));
}

function parseFormattedNumber(value) {
  return Number(String(value).replace(/,/g, ''));
}

function extractFirstMatch(html, patterns, fieldName) {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    const value = match && match[1] ? match[1].trim() : '';
    if (value) {
      return value;
    }
  }

  throw new Error(`Failed to parse ${fieldName} from apexranked.com.`);
}

async function fetchHtml(url) {
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

async function fetchApexRankedStats() {
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
    masterPlayers: estimatedMasterPlayers + PC_PREDATOR_SLOTS,
    predatorPlayers: PC_PREDATOR_SLOTS,
    predatorCutoffRp,
    fetchedAt: new Date().toISOString(),
    source: 'apexranked.com'
  };
}

async function fetchTrackerRankedStats() {
  const trackerApiKey = String(process.env.TRACKER_GG_API_KEY || '').trim();
  if (!trackerApiKey) {
    return fetchApexRankedStats();
  }

  const commonHeaders = {
    'TRN-Api-Key': trackerApiKey,
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

  const predatorJson = await predatorResponse.json();
  const distributionJson = await distributionResponse.json();

  const masterPlayers = predatorJson && predatorJson.data ? predatorJson.data.masterOrAboveCount : undefined;
  const predatorCutoffRp = predatorJson && predatorJson.data ? predatorJson.data.rankScoreNeeded : undefined;
  const predatorPlayers =
    distributionJson && Array.isArray(distributionJson.data)
      ? distributionJson.data.find((item) => item && item.tier === 'Predator')?.count
      : undefined;

  if (
    typeof masterPlayers !== 'number' ||
    typeof predatorPlayers !== 'number' ||
    typeof predatorCutoffRp !== 'number'
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

async function fetchRankedStatsWithFallback() {
  try {
    return await fetchTrackerRankedStats();
  } catch (trackerError) {
    try {
      return await fetchApexRankedStats();
    } catch (fallbackError) {
      const trackerMessage = trackerError instanceof Error ? trackerError.message : 'Unknown tracker.gg error.';
      const fallbackMessage =
        fallbackError instanceof Error ? fallbackError.message : 'Unknown apexranked.com error.';

      throw new Error(
        `tracker.gg failed: ${trackerMessage}; apexranked.com fallback failed: ${fallbackMessage}`
      );
    }
  }
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    writeJson(response, 400, { error: 'Missing request URL.' });
    return;
  }

  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, CORS_HEADERS);
    response.end();
    return;
  }

  if (request.method !== 'GET') {
    writeJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  if (url.pathname === '/health') {
    writeJson(response, 200, {
      ok: true,
      service: 'apex-tracker-proxy-fc'
    });
    return;
  }

  if (url.pathname === '/ranked-stats') {
    try {
      const data = await fetchRankedStatsWithFallback();
      writeJson(response, 200, data);
    } catch (error) {
      writeJson(response, 502, {
        error: error instanceof Error ? error.message : 'Unknown FC error.'
      });
    }
    return;
  }

  writeJson(response, 404, {
    message: 'Available endpoints: /ranked-stats, /health'
  });
});

server.listen(PORT, () => {
  console.log(`Apex tracker proxy FC server listening on port ${PORT}`);
});
