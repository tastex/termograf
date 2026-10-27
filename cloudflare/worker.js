// Термограф: зеркало Open-Meteo на Cloudflare Workers.
// Страница ходит сюда, если сам open-meteo.com не отвечает.
//   /api/...     → https://api.open-meteo.com/...          (прогноз и последние месяцы)
//   /archive/... → https://archive-api.open-meteo.com/...  (архив за годы)
//   /geo/...     → https://geocoding-api.open-meteo.com/... (поиск городов)
// Остальные адреса — сами страницы сайта (статические файлы из корня репозитория, см. "assets" в wrangler.jsonc):
// так у каждой ветки и PR есть рабочее превью. Cloudflare отдаёт их раньше, чем доходит до этого кода.

const HOSTS = {
  api: 'api.open-meteo.com',
  archive: 'archive-api.open-meteo.com',
  geo: 'geocoding-api.open-meteo.com',
};
// Кому можно пользоваться зеркалом. Пустой список — всем.
const ALLOWED_ORIGINS = ['https://tastex.github.io'];
// Ответы не кэшируются на стороне Cloudflare: Open-Meteo иногда обрывает длинный ответ на середине
// («Unexpected error while streaming data»), и такой обрывок потом сутки отдавался бы вместо данных.
// Страница сама хранит архив в памяти телефона.

export default {
  async fetch(request, env) {
    // the site's own front page (every other page file is served before the worker is reached)
    if (env && env.ASSETS && new URL(request.url).pathname === '/') return env.ASSETS.fetch(new URL('/index.html', request.url));
    const origin = request.headers.get('Origin') || '';
    // the pages served by this same worker (a branch preview, see wrangler.jsonc) may use it too
    const allowed = !ALLOWED_ORIGINS.length || !origin || ALLOWED_ORIGINS.includes(origin) || origin === new URL(request.url).origin;
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
    const upstream = await fetch(target, { cf: { cacheTtl: 0 } });
    const body = await upstream.text();
    const headers = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    headers.set('Cache-Control', 'no-store');
    // a reply cut off on the way is not JSON: say so plainly instead of passing the scrap on
    let whole = true; try { JSON.parse(body); } catch (e) { whole = false; }
    if (!whole) return new Response(JSON.stringify({ error: true, reason: 'upstream reply cut off' }), { status: 502, headers });
    return new Response(body, { status: upstream.status, headers });
  },
};
