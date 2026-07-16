export type FetchInit = RequestInit & {
  readonly next?: { readonly revalidate?: number };
  readonly timeoutMs?: number;
};

export const SCOREBOARD_TIMEOUT_MS = 6_000;
export const STREAM_LIST_TIMEOUT_MS = 4_000;
export const STREAM_DETAIL_TIMEOUT_MS = 5_000;
export const PROXY_FETCH_TIMEOUT_MS = 10_000;

function timeoutSignal(ms: number, signal?: AbortSignal | null): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([signal, timeout]);

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  timeout.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

export function fetchWithTimeout(
  input: string | URL | Request,
  init: FetchInit = {},
): Promise<Response> {
  const { timeoutMs = PROXY_FETCH_TIMEOUT_MS, signal, ...rest } = init;
  return fetch(input, {
    ...rest,
    signal: timeoutSignal(timeoutMs, signal),
  });
}
