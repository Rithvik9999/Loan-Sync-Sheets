import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

export default defineConfig(async ({ command }) => {
  // PORT only matters for the dev/preview servers. Vite reports `command`
  // as 'serve' for both `vite` (dev) and `vite preview`, and 'build' for
  // `vite build`. `vite build` (used by both our Replit build and Vercel)
  // never binds a port, so we must not require PORT there — Vercel's build
  // environment has no PORT set and there's nothing meaningful to require.
  const rawPort = process.env.PORT;
  let port = 5173; // vite's own default; only used by serve commands below

  if (command === 'serve') {
    if (!rawPort) {
      throw new Error(
        'PORT environment variable is required but was not provided.',
      );
    }

    port = Number(rawPort);

    if (Number.isNaN(port) || port <= 0) {
      throw new Error(`Invalid PORT value: "${rawPort}"`);
    }
  } else if (rawPort) {
    const parsed = Number(rawPort);
    if (!Number.isNaN(parsed) && parsed > 0) port = parsed;
  }

  // BASE_PATH determines the public base path assets are served from. On
  // Replit this is always injected by the artifact platform. On Vercel (or
  // any other host serving this app at the domain root) it's safe to
  // default to "/".
  const basePath = process.env.BASE_PATH ?? '/';

  return {
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  };
});
