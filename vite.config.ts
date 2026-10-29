import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig, loadEnv} from 'vite';
import {nodePolyfills} from 'vite-plugin-node-polyfills';

export default defineConfig(({mode}) => {
  // RPC_URL (no VITE_ prefix) never reaches the bundle. In dev, Vite proxies
  // /rpc to it the same way the Cloudflare worker does in production.
  const env = loadEnv(mode, process.cwd(), '');
  const upstream = env.RPC_URL ? new URL(env.RPC_URL) : null;

  return {
    plugins: [
      react(),
      tailwindcss(),
      // @solana/web3.js v1 still reaches for Buffer in the browser.
      nodePolyfills({include: ['buffer'], globals: {Buffer: true, global: false, process: false}}),
    ],
    build: {target: 'es2020'},
    server: {
      port: 5180,
      strictPort: true,
      proxy: upstream
        ? {
            '/rpc': {
              target: upstream.origin,
              changeOrigin: true,
              ws: true,
              rewrite: () => upstream.pathname + upstream.search,
            },
          }
        : undefined,
    },
  };
});
