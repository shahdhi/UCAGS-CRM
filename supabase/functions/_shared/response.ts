/**
 * Standard JSON response helpers for Edge Functions
 */

import { corsHeaders } from './cors.ts';

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ success: false, error: message }, status);
}

export function successResponse(data: Record<string, unknown> = {}, status = 200): Response {
  return jsonResponse({ success: true, ...data }, status);
}
