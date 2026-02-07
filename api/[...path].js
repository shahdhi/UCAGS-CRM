// Vercel Serverless Function entrypoint
// Routes all /api/* requests to the Express app.

const app = require('../backend/index');

module.exports = (req, res) => {
  // Depending on the runtime, req.url may be "/leads" (without /api) or "/api/leads".
  // Our Express app registers routes under "/api/*", so normalize to include "/api".
  if (req.url && !req.url.startsWith('/api')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }

  return app(req, res);
};
