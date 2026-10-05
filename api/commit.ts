// Vercel Edge Function — return the actual deployed commit SHA.
// VERCEL_GIT_COMMIT_SHA is injected by Vercel at build time. Local dev
// and non-Vercel hosts return 404 and the client falls back to the
// GitHub API (main-branch HEAD).

export const config = { runtime: 'edge' };

export default function handler() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const ref = process.env.VERCEL_GIT_COMMIT_REF || '';
  if (!sha) {
    return new Response('not-on-vercel', { status: 404 });
  }
  return new Response(JSON.stringify({ sha, ref }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
    },
  });
}
