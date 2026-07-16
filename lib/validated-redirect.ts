import type { FetchInit } from "./upstream";
import { fetchWithTimeout } from "./upstream";

export type RedirectFetcher = (
  input: string | URL | Request,
  init?: FetchInit,
) => Promise<Response>;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function redirectedMethod(status: number, method: string): string {
  if (status === 303 && method !== "HEAD") return "GET";
  if ((status === 301 || status === 302) && method === "POST") return "GET";
  return method;
}

/** Follow redirects only after validating every destination, including the first URL. */
export async function fetchWithValidatedRedirects(
  initial: string | URL,
  isAllowed: (url: URL) => boolean,
  init: FetchInit = {},
  fetcher: RedirectFetcher = fetchWithTimeout,
  maxRedirects = 4,
): Promise<Response> {
  let target = new URL(initial);
  if (!isAllowed(target)) throw new Error("upstream host not allowed");

  let method = (init.method ?? "GET").toUpperCase();
  let body = init.body;
  let headers = new Headers(init.headers);

  for (let redirects = 0; ; redirects += 1) {
    const response = await fetcher(target, {
      ...init,
      method,
      body,
      headers,
      redirect: "manual",
    });
    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    await response.body?.cancel().catch(() => undefined);
    if (redirects >= maxRedirects) throw new Error("upstream redirect limit exceeded");

    const next = new URL(location, target);
    if (!isAllowed(next)) throw new Error("upstream redirect host not allowed");

    const nextMethod = redirectedMethod(response.status, method);
    if (nextMethod !== method) {
      body = undefined;
      headers = new Headers(headers);
      headers.delete("content-length");
      headers.delete("content-type");
    }
    method = nextMethod;
    target = next;
  }
}
