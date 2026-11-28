import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db, PUBLIC_UPLOAD_DIR, runMigrations, seedInitialData } from './server/db.ts';
import { commitStudentImport } from './server/excelImport.ts';
import { initRealtimeServer } from './server/realtime.ts';
import { createApiRouter } from './server/routes.ts';

function ensureBook1StudentsSeeded() {
  const enrollmentCount = (db.prepare('SELECT COUNT(*) as c FROM enrollments').get() as { c: number }).c;
  if (enrollmentCount > 0) return;

  const dataPath = path.resolve(process.cwd(), 'server', 'data', 'book1Students.json');
  if (!fs.existsSync(dataPath)) return;

  try {
    const rawRows = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as Array<Record<string, string>>;
    if (!Array.isArray(rawRows) || rawRows.length === 0) return;
    commitStudentImport(
      {
        fileName: 'Book1.xlsx',
        sheetName: 'Sheet1',
        headerRow: 9,
        headers: Object.keys(rawRows[0] || {}),
        rows: rawRows.map((raw, idx) => ({ rowNumber: 10 + idx, raw })),
      },
      { id: null, full_name: 'AITM System Bootstrap', role: 'SYSTEM' }
    );
  } catch (err) {
    console.error('Book1 student bootstrap skipped:', err);
  }
}

async function startServer() {
  runMigrations();
  seedInitialData();
  ensureBook1StudentsSeeded();

  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Basic security headers (do not set X-Frame-Options so iframe preview works smoothly)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Serve ONLY public website branding & course thumbnail uploads (private course docs are NEVER statically served)
  app.use(
    '/uploads/public',
    express.static(PUBLIC_UPLOAD_DIR, {
      maxAge: '1h',
      dotfiles: 'ignore',
    })
  );

  // Mount API routes
  app.use('/api', createApiRouter());

  // API 404 fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  const httpServer = http.createServer(app);
  initRealtimeServer(httpServer);

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`AITM LMS server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AITM LMS server:', err);
  process.exit(1);
});
