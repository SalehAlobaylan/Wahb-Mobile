const cmsUrl = new URL(
  process.env.WAHB_LOCAL_CMS_URL ?? 'http://127.0.0.1:8080',
);
const iamUrl = new URL(
  process.env.WAHB_LOCAL_IAM_URL ?? 'http://127.0.0.1:4003',
);

for (const url of [cmsUrl, iamUrl]) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error(
      `Local integration checks only accept loopback URLs; received ${url.origin}.`,
    );
  }
}

async function checkHealth(name, url, expectedStatus) {
  let response;
  try {
    response = await fetch(new URL('/health', url), {
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    throw new Error(
      `${name} is unavailable at ${url.origin}. Start the local stack from the repository root with ./start.sh before running this command.`,
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new Error(
      `${name} health endpoint returned HTTP ${response.status}.`,
    );
  }
  const body = await response.json();
  if (body.status !== expectedStatus) {
    throw new Error(
      `${name} health endpoint returned an unexpected status: ${String(body.status)}.`,
    );
  }
}

await checkHealth('CMS', cmsUrl, 'ok');
await checkHealth('IAM', iamUrl, 'healthy');

async function getJson(name, url, expectedKeys) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) {
    throw new Error(`${name} returned HTTP ${response.status}.`);
  }
  const body = await response.json();
  if (!body || typeof body !== 'object') {
    throw new Error(`${name} returned a non-object JSON response.`);
  }
  for (const key of expectedKeys) {
    if (!(key in body)) {
      throw new Error(`${name} response is missing required key ${key}.`);
    }
  }
  return body;
}

const installationId = crypto.randomUUID();
const forYou = await getJson(
  'CMS anonymous For You feed',
  new URL(
    `/api/v1/feed/foryou?limit=1&session_id=${encodeURIComponent(installationId)}`,
    cmsUrl,
  ),
  ['items', 'caught_up'],
);
if (!Array.isArray(forYou.items) || typeof forYou.caught_up !== 'boolean') {
  throw new Error(
    'CMS anonymous For You feed violates the mobile response contract.',
  );
}

const news = await getJson(
  'CMS anonymous News feed',
  new URL(
    `/api/v1/feed/news?limit=1&session_id=${encodeURIComponent(installationId)}`,
    cmsUrl,
  ),
  ['slides'],
);
if (!Array.isArray(news.slides)) {
  throw new Error(
    'CMS anonymous News feed violates the mobile response contract.',
  );
}

process.stdout.write(
  'Local CMS/IAM health and anonymous feed contracts passed. Authenticated mutations require disposable fixture credentials and are intentionally not inferred.\n',
);
