// Cloudflare Pages Functions: GET /api/gtimg/kline?param=sz000993,day,,,80,qfq
// 服务端反代腾讯日K接口，绕过浏览器 CORS —— 自选池监控（/watchlist）生产环境依赖此函数。
// 本地 dev/preview 由 vite.config.ts 的同名代理兜底，两边路径一致、前端零改动。
export async function onRequestGet({ request }) {
  try {
    const url = new URL(request.url);
    const param = url.searchParams.get('param') || '';
    if (!param) {
      return new Response(JSON.stringify({ error: 'missing param' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      });
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const target = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=' + encodeURIComponent(param);
    const resp = await fetch(target, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://gu.qq.com/',
        'Accept': 'application/json, text/plain, */*',
      },
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error('gtimg status ' + resp.status);
    const body = await resp.text();
    return new Response(body, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e && e.message) || e) }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
