import type { HttpResponseInit } from '@azure/functions';

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
 * use that status; all others become 500.
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
      return json({ error: code }, status);
    }
  };
}
