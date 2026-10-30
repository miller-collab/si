import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Never cache API responses
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // Health check and ping
  app.get('/api/setup/sync', (req, res) => {
    res.json({
      status: 'ok',
      source: 'firestore_authoritative',
      timestamp: Date.now()
    });
  });

  // Endpoint sync-from-cloud desativado (Firestore é a única fonte de verdade soberana)
  app.post('/api/setup/sync-from-cloud', (req, res) => {
    res.json({
      sucesso: true,
      message: 'Sincronização em disco desativada. O Firestore é a única fonte da verdade.'
    });
  });

  // Vite Integration
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Setup Interno CNC Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
