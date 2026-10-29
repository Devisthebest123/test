/**
 * Edge worker: serves the static site and hides the RPC key.
 *
 * The browser talks to /rpc on our own origin with no credentials. This
 * worker forwards the JSON-RPC body (or the WebSocket upgrade) to the real
 * endpoint, whose URL with the key lives only in a Cloudflare secret.
 */

type Fetcher = {fetch: (req: Request) => Promise<Response>};

export interface Env {
  /** Full upstream URL including the key, e.g. https://mainnet.helius-rpc.com/?api-key=... */
  RPC_URL: string;
  ASSETS: Fetcher;
}

const MAX_BODY = 200_000;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== '/rpc') return env.ASSETS.fetch(req);

    if (!env.RPC_URL) return new Response('rpc not configured', {status: 503});

    // Only our own pages may use the proxy. Same-origin requests carry our
    // origin or none; anything else is someone borrowing the quota.
    const origin = req.headers.get('Origin');
    if (origin && origin !== url.origin) return new Response('forbidden', {status: 403});

    const upstream = env.RPC_URL;

    if (req.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      // web3.js subscriptions. Workers proxy WebSockets by forwarding the upgrade request as-is.
      return fetch(upstream, req);
    }

    if (req.method !== 'POST') return new Response('method not allowed', {status: 405});
    const body = await req.text();
    if (body.length > MAX_BODY) return new Response('too large', {status: 413});

    const res = await fetch(upstream, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body,
    });
    return new Response(res.body, {
      status: res.status,
      headers: {'content-type': 'application/json', 'cache-control': 'no-store'},
    });
  },
};
