const origin = (
  process.env.RELEASE_PUBLIC_ORIGIN ?? 'https://wahb.salehspace.dev'
).replace(/\/$/, '');
const applePrefix = process.env.APPLE_APP_ID_PREFIX?.trim().toUpperCase();
const androidFingerprints = process.env.ANDROID_APP_LINK_CERT_SHA256?.split(',')
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);

if (!applePrefix || !androidFingerprints?.length) {
  throw new Error(
    'Set APPLE_APP_ID_PREFIX and ANDROID_APP_LINK_CERT_SHA256 before verifying public links.',
  );
}

async function fetchRequired(path) {
  const response = await fetch(`${origin}${path}`, { redirect: 'error' });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}.`);
  }
  return response;
}

for (const path of [
  '/ar/privacy',
  '/en/privacy',
  '/ar/support',
  '/en/support',
  '/ar/terms',
  '/en/terms',
]) {
  await fetchRequired(path);
}

const aasa = await (
  await fetchRequired('/.well-known/apple-app-site-association')
).json();
const aasaAppIds = aasa?.applinks?.details?.map((detail) => detail.appID) ?? [];
if (!aasaAppIds.includes(`${applePrefix}.com.salehspace.wahb`)) {
  throw new Error('AASA does not contain Wahb’s Apple application identifier.');
}

const assetLinks = await (
  await fetchRequired('/.well-known/assetlinks.json')
).json();
const androidTarget = assetLinks.find(
  (entry) => entry?.target?.package_name === 'com.salehspace.wahb',
);
const publishedFingerprints =
  androidTarget?.target?.sha256_cert_fingerprints ?? [];
if (
  !androidFingerprints.every((fingerprint) =>
    publishedFingerprints.includes(fingerprint),
  )
) {
  throw new Error(
    'assetlinks.json does not contain every release signing fingerprint.',
  );
}

console.log(
  `Public legal pages and mobile associations verified at ${origin}.`,
);
