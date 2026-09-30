interface JsonResponseOptions {
  status?: number | null | undefined;
  headers?: Record<string, string> | null | undefined;
}

export function jsonResponse(body: unknown, init: JsonResponseOptions = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}
