import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const isBrowser    = typeof window !== 'undefined';

const RETRY_COUNT = 1; // max 1 retry to avoid blocking the UI

/** Diagnostics are emitted once per host so auth-js retries don't spam the console. */
const reportedHosts = new Set<string>();

function hostOf(input: RequestInfo | URL): string {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return new URL(raw).host;
  } catch {
    return 'unknown-host';
  }
}

function decodeJwtSegment(segment: string): Record<string, unknown> | null {
  try {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)));
  } catch {
    return null;
  }
}

/**
 * The anon key is a JWT that carries the project ref in its payload. A key that is
 * truncated, scrambled by a bad copy/paste, or left over from another project fails
 * at request time with errors that never mention the credentials. Check it once at
 * module load so the console names the real problem.
 */
function validateConfig(url: string, key: string) {
  if (!url || !key) return; // handled by the unconfigured-client proxy below

  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    console.error(`[supabase] NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${url}`);
    return;
  }

  const segments = key.split('.');
  if (segments.length !== 3) {
    console.error(
      `[supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY is not a well-formed JWT ` +
      `(${segments.length} dot-separated segments, expected 3). It was likely truncated or ` +
      `mangled on copy. Recopy it from Supabase → Project Settings → API.`,
    );
    return;
  }

  const payload = decodeJwtSegment(segments[1]);
  if (!payload) {
    console.error('[supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY payload is not decodable base64url JSON.');
    return;
  }

  if (payload.role !== 'anon') {
    console.error(
      `[supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY has role="${String(payload.role)}", expected "anon". ` +
      (payload.role === 'service_role'
        ? 'This is the service role key — it must never reach the browser. Revoke it and use the anon key.'
        : 'The key is corrupted or is not an anon key.'),
    );
    return;
  }

  const ref = typeof payload.ref === 'string' ? payload.ref : null;
  if (ref && !host.startsWith(`${ref}.`)) {
    console.error(
      `[supabase] Credential mismatch: NEXT_PUBLIC_SUPABASE_URL points at "${host}" but the anon key ` +
      `belongs to project "${ref}". The URL and the key must come from the same project.`,
    );
    return;
  }

  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  if (exp && exp * 1000 < Date.now()) {
    console.error(`[supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY expired on ${new Date(exp * 1000).toISOString()}.`);
  }
}

/**
 * A rejected fetch to Supabase means one of three things, and Supabase's own
 * `AuthRetryableFetchError` reports none of them — it surfaces as an empty `{}`.
 * Name the cause here, once, so the console says what actually broke.
 */
function reportNetworkFailure(host: string, err: Error | null) {
  if (reportedHosts.has(host)) return;
  reportedHosts.add(host);

  const message = err?.message ?? 'fetch failed';
  const unreachable = /failed to fetch|fetch failed|name_not_resolved|enotfound|networkerror/i.test(message);

  console.error(
    `[supabase] Cannot reach ${host} — ${message}\n` +
    (unreachable
      ? `The host does not resolve. The Supabase project behind NEXT_PUBLIC_SUPABASE_URL is deleted, ` +
        `renamed, or the URL is wrong. Check the project ref at https://supabase.com/dashboard and ` +
        `update NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, then restart the dev server.`
      : `Request timed out or was blocked. Check connectivity and whether the project is paused.`),
  );
}

/**
 * auth-js classifies these as retryable network errors. The catch is that
 * `handleError` builds the message from the Response object without reading its
 * body, so `JSON.stringify(response)` is `{}` — an upstream 502 surfaces exactly
 * as blank as a dead socket. Log the body here so the real cause is visible.
 */
const UPSTREAM_ERROR_CODES = [502, 503, 504, 520, 521, 522, 523, 524, 530];

async function reportUpstreamError(res: Response, host: string) {
  const tag = `${host}:${res.status}`;
  if (reportedHosts.has(tag)) return;
  reportedHosts.add(tag);

  let body = '';
  try {
    body = (await res.clone().text()).slice(0, 300);
  } catch {
    /* body already consumed or unreadable — the status alone still tells the story */
  }

  const dbDown = /databasetimeout|connection to the database|too many connections/i.test(body);

  console.error(
    `[supabase] ${host} returned HTTP ${res.status}${body ? ` — ${body}` : ''}\n` +
    (dbDown || res.status === 502
      ? `The Supabase services are up but cannot reach the Postgres database. This is what a ` +
        `paused, restoring, or connection-exhausted project looks like. Open ` +
        `https://supabase.com/dashboard and resume/restore the project, then retry. ` +
        `No code change will work around this.`
      : `Upstream is failing. Check https://status.supabase.com and the project dashboard.`),
  );
}

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    try {
      const res = await fetch(input, {
        ...init,
        signal: attempt < RETRY_COUNT
          ? AbortSignal.timeout(8_000)
          : (init?.signal ?? AbortSignal.timeout(12_000)),
      });
      // Returned, not thrown: auth-js still sees the true status and its own retry
      // logic is untouched. We only make sure the console explains the failure.
      if (UPSTREAM_ERROR_CODES.includes(res.status)) {
        await reportUpstreamError(res, hostOf(input));
      }
      return res;
    } catch (err) {
      lastErr = err as Error;
      if (attempt < RETRY_COUNT) {
        // Short fixed backoff — avoids blocking UI for seconds on transient errors
        await new Promise(r => setTimeout(r, 150));
      }
    }
  }

  const host = hostOf(input);
  reportNetworkFailure(host, lastErr);

  // Throw rather than returning a synthetic 5xx Response. auth-js `handleError`
  // classifies 502/503/504 as network errors and builds the message from the
  // *Response object* without ever reading its body — `JSON.stringify(response)`
  // is `{}`, which is exactly the bare `AuthRetryableFetchError {}` seen in the
  // console. Throwing routes through the `catch` in `_handleRequest`, where
  // `_getErrorMessage` reads `error.message` and the real cause survives.
  throw new Error(`Supabase unreachable at ${host}: ${lastErr?.message ?? 'fetch failed'}`);
}

if (isBrowser) validateConfig(supabaseUrl, supabaseKey);

export const supabase = isBrowser && supabaseUrl && supabaseKey
  ? createBrowserClient(supabaseUrl, supabaseKey, {
      global: { fetch: fetchWithRetry },
    })
  : (() => {
      const warn = () => {
        console.warn('Supabase client not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
        return Promise.resolve({ data: { user: null, session: null }, error: null });
      };
      return new Proxy({} as any, {
        get: (_t, prop) => {
          if (prop === 'auth') return new Proxy({} as any, { get: () => warn });
          return warn;
        },
      });
    })();
