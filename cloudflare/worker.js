// Термограф: зеркало Open-Meteo на Cloudflare Workers.
// Страница ходит сюда, если сам open-meteo.com не отвечает.
//   /api/...     → https://api.open-meteo.com/...          (прогноз и последние месяцы)
//   /archive/... → https://archive-api.open-meteo.com/...  (архив за годы)
//   /geo/...     → https://geocoding-api.open-meteo.com/... (поиск городов)

const HOSTS = {
  api: 'api.open-meteo.com',
  archive: 'archive-api.open-meteo.com',
  geo: 'geocoding-api.open-meteo.com',
};
// Кому можно пользоваться зеркалом. Пустой список — всем.
const ALLOWED_ORIGINS = ['https://tastex.github.io'];
// Сколько секунд Cloudflare держит ответ у себя: архив не меняется, прогноз обновляется.
const CACHE = { api: 600, archive: 86400, geo: 86400 };

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const allowed = !ALLOWED_ORIGINS.length || !origin || ALLOWED_ORIGINS.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': allowed && origin ? origin : ALLOWED_ORIGINS[0] || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!allowed) return new Response('Forbidden', { status: 403, headers: cors });

    const url = new URL(request.url);
    const [, key, ...rest] = url.pathname.split('/');
    const host = HOSTS[key];
    if (!host || request.method !== 'GET') return new Response('Not found', { status: 404, headers: cors });

    const target = `https://${host}/${rest.join('/')}${url.search}`;
    const upstream = await fetch(target, { cf: { cacheTtl: CACHE[key], cacheEverything: true } });
    const headers = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
