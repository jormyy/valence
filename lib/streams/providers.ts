import type { BootstrapStrategy, EmbedHostRule, MediaHostRule, Provider } from "./types";
import { streamed } from "./streamed";
import { sportsrc } from "./sportsrc";
import { embedsportex } from "./embedsportex";
import { ppv } from "./ppv";

// Order matters: earlier providers appear first in the watch panel after URL deduping.
export const PROVIDERS = [streamed, sportsrc, embedsportex, ppv] as const satisfies readonly Provider[];

export const EMBED_HOSTS: EmbedHostRule[] = [
  ...new Map(
    PROVIDERS
      .flatMap((provider) => provider.capabilities.embedHosts)
      .map((rule) => [rule.hostname, rule]),
  ).values(),
];

const EMBED_HOST_BY_NAME = new Map(EMBED_HOSTS.map((rule) => [rule.hostname, rule]));

export const MEDIA_HOST_RULES: MediaHostRule[] = [
  ...new Map(
    PROVIDERS
      .flatMap((provider) => provider.capabilities.mediaHosts ?? [])
      .map((rule) => [
        `${rule.includeSubdomains ? "*" : ""}${rule.hostname}${rule.pathPrefix ?? ""}`,
        rule,
      ]),
  ).values(),
];

export function isAllowedEmbedUrl(url: URL): boolean {
  return url.protocol === "https:" && EMBED_HOST_BY_NAME.has(url.hostname);
}

function hostMatches(rule: MediaHostRule, hostname: string): boolean {
  return hostname === rule.hostname
    || (rule.includeSubdomains === true && hostname.endsWith(`.${rule.hostname}`));
}

export function isAllowedMediaUrl(url: URL): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  return MEDIA_HOST_RULES.some((rule) =>
    hostMatches(rule, url.hostname)
    && (!rule.pathPrefix || url.pathname.startsWith(rule.pathPrefix))
  );
}

export function embedHostsCsp(): string {
  return EMBED_HOSTS.map((rule) => `https://${rule.hostname}`).join(" ");
}

export function defaultEmbedOrigin(fallback = "https://embed.st"): string {
  const fallbackHost = new URL(fallback).hostname;
  const host = EMBED_HOST_BY_NAME.has(fallbackHost)
    ? fallbackHost
    : EMBED_HOSTS[0]?.hostname;
  if (!host) return fallback;
  return `https://${host}`;
}

export function originFromEmbedReferer(request: Request, fallback = "https://embed.st"): string {
  const defaultOrigin = defaultEmbedOrigin(fallback);
  const referer = request.headers.get("referer");
  if (!referer) return defaultOrigin;

  try {
    const ref = new URL(referer);
    const raw = ref.searchParams.get("u");
    if (!raw) return defaultOrigin;

    const target = new URL(raw);
    if (isAllowedEmbedUrl(target)) return target.origin;
  } catch {
    return defaultOrigin;
  }

  return defaultOrigin;
}

export function bootstrapStrategyFor(hostname: string): BootstrapStrategy | null {
  return EMBED_HOST_BY_NAME.get(hostname)?.bootstrapStrategy ?? null;
}
