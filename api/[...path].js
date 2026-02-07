// Vercel Serverless Function entrypoint
// Routes all /api/* requests to the Express app.

let app;

module.exports = async (req, res) => {
  try {
    // Lazy-load the Express app so module-load crashes can be caught and returned as JSON
    if (!app) {
      app = require('../backend/index');
    }
    // Depending on the runtime, req.url may be "/leads" (without /api) or "/api/leads".
    // Our Express app registers routes under "/api/*", so normalize to include "/api".
    if (req.url && !req.url.startsWith('/api')) {
      req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
    }

    // Wrap express invocation so we can catch sync crashes and return JSON (instead of Vercel generic HTML)
    await new Promise((resolve, reject) => {
      app(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (err) {
    // If headers already sent, just end.
    if (res.headersSent) {
      return res.end();
    }

    const status = err?.status || err?.statusCode || 500;
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        success: false,
        error: err?.message || 'Internal Server Error',
        // include stack in non-production for easier debugging
        stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack
      })
    );
  }
};
