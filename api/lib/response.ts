import type { HttpResponseInit } from '@azure/functions';

/**
 * Wraps a value in an Azure Functions HTTP response with JSON Content-Type.
 *
 * @param body - Any value to serialize as JSON
 * @param status - HTTP status code (default 200)
 * @returns Azure Functions HTTP response init object
 */
export function json(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * Wraps an endpoint handler so it can throw errors instead of building
 * error responses manually. Thrown errors with a numeric `status` property
 * use that status code; all others become 500 INTERNAL_ERROR.
 * The error message becomes the `error` field in the JSON response body,
 * which the client reads to identify the specific failure (e.g. "PALLET_MISMATCH").
 * An optional `data` property (a plain object) is spread into the response body
 * alongside `error` — for cases where the client needs more than just the error
 * code to react correctly (e.g. LEVEL_MISMATCH's scanned/actual level, so the
 * frontend can show them in a confirmation prompt rather than a generic message).
 *
 * @param fn - The async endpoint handler to wrap
 * @returns An Azure Functions HttpHandler that catches and formats thrown errors
 */
export function withHandler(
  fn: (req: import('@azure/functions').HttpRequest, ctx: import('@azure/functions').InvocationContext) => Promise<unknown>,
): import('@azure/functions').HttpHandler {
  return async (req, ctx) => {
    try {
      const result = await fn(req, ctx);
      return json(result);
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      const code = err instanceof Error ? err.message : 'INTERNAL_ERROR';
      const data = (err as { data?: Record<string, unknown> }).data;
      return json({ error: code, ...data }, status);
    }
  };
}
