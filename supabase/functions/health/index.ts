import { handleCors } from '../_shared/cors.ts';
import { successResponse } from '../_shared/response.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  return successResponse({ status: 'ok', timestamp: new Date().toISOString() });
});
