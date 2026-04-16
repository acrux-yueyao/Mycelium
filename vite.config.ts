import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * In dev we serve `/api/emotion` via a tiny Vite middleware that imports
 * `api/emotion.ts` and invokes its handler. In production (Vercel) the
 * same file is picked up as an Edge function. One source of truth.
 */
function apiMiddleware(): Plugin {
  return {
    name: 'mycelium-api',
    configureServer(server) {
      server.middlewares.use('/api/emotion', async (req, res) => {
        try {
          const mod = await server.ssrLoadModule('/api/emotion.ts');
          const handler = mod.default as (req: Request) => Promise<Response>;
          // Collect body
          const chunks: Buffer[] = [];
          for await (const chunk of req as unknown as AsyncIterable<Buffer>) {
            chunks.push(chunk);
          }
          const body = Buffer.concat(chunks).toString('utf-8');
          const webReq = new Request('http://local/api/emotion', {
            method: req.method,
            headers: req.headers as unknown as HeadersInit,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
          });
          const webRes = await handler(webReq);
          res.statusCode = webRes.status;
          webRes.headers.forEach((v, k) => res.setHeader(k, v));
          const text = await webRes.text();
          res.end(text);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'middleware-crash', detail: String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiMiddleware()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2022',
  },
});
