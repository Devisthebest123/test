# Deployment

Whisper is a static bundle. `npm run build` produces `dist/`, which runs on any static host against any Solana RPC endpoint the user configures. Nothing below is required to use the protocol.

## Keeping an RPC key out of the browser

Public RPC nodes refuse browser traffic on mainnet, so a hosted instance usually needs a provider endpoint with a key. A key placed in a `VITE_` variable would be compiled into the bundle and readable by anyone. Whisper instead reads the endpoint from `RPC_URL` (no `VITE_` prefix, never bundled) and exposes it to the browser as `/rpc` on the site's own origin:

- in development, Vite proxies `/rpc` to `RPC_URL` from `.env.local`;
- in production, a small edge function does the same, reading `RPC_URL` from a secret, forwarding WebSocket upgrades (web3.js uses them for confirmations), and refusing requests whose `Origin` is not the site itself.

The reference edge function is a Cloudflare Worker in `worker/index.ts`, about forty lines. Any equivalent (a reverse proxy, a serverless function) works; the contract is only "POST and WebSocket at `/rpc`, same origin".

## Reference setup (Cloudflare)

```bash
printf 'VITE_NETWORK=mainnet-beta
VITE_RPC_MAINNET=proxy
RPC_URL=https://…
' > .env.local   # git-ignored
npx wrangler login
npx wrangler secret put RPC_URL     # same URL as in .env.local; stays server-side
npm run deploy                      # build + wrangler deploy
```

`wrangler.jsonc` serves `dist/` as static assets and routes `/rpc` to the worker. A build that names a cluster in `VITE_NETWORK` opens on that cluster on every load.

## Any other host

Build with `VITE_RPC_MAINNET` set to a full endpoint URL only if you accept that the key will be public, or put your own `/rpc` proxy in front and set `VITE_RPC_MAINNET=proxy`. Then upload `dist/`.

## Verifying a hosted build

A hosted copy should match the repository. Build the tagged commit yourself and compare the asset hashes with what the site serves. CI additionally fails the build if any key-shaped string appears in `dist/`.
