import { browserHeaders } from "../embed-request";
import { PROXY_FETCH_TIMEOUT_MS, fetchWithTimeout } from "../upstream";
import { isAllowedEmbedUrl, isAllowedMediaUrl } from "./providers";

const SPORTEX_PLAYER_HOST = "streams.esportex.site";
const SPORTEX_DATA_URL = "https://data.esportex.site/api/data";
const SPORTEX_ORIGIN = "https://streams.esportex.site";
const EMBEDHD_HOST = "embedhd.org";
const EMBEDHD_ORIGIN = "https://embedhd.org";
const EXPOSESTRAT_HOST = "exposestrat.com";
export const EXPOSESTRAT_ORIGIN = "https://exposestrat.com";
const XOR_KEY = 90;

type Fetcher = typeof fetchWithTimeout;

type EsportexData = {
  readonly id: string;
  readonly type: string;
  readonly url: string;
};

export type ResolvedEsportexHls = {
  readonly hlsUrl: URL;
  readonly refererOrigin: string;
  readonly playerId: string;
  readonly fid: string;
};

export type ResolvedEsportexEmbed = {
  readonly embedUrl: URL;
  readonly playerId: string;
};

export type ResolvedEsportexPlayer =
  | ({ readonly kind: "hls" } & ResolvedEsportexHls)
  | ({ readonly kind: "embed" } & ResolvedEsportexEmbed);

type ResolvedEsportexData = {
  readonly playerId: string;
  readonly data: EsportexData;
};

function base64Decode(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function esportexHashToken(target: URL): string | null {
  if (target.protocol !== "https:" || target.hostname !== SPORTEX_PLAYER_HOST) return null;
  if (!target.hash) return null;

  try {
    return decodeURIComponent(target.hash.slice(1));
  } catch {
    return target.hash.slice(1);
  }
}

export function decodeEsportexPlayerId(target: URL): string | null {
  const token = esportexHashToken(target);
  if (!token) return null;

  const decoded = base64Decode(token)?.trim();
  if (!decoded || !/^[a-z]+\/[A-Za-z0-9_-]+$/.test(decoded)) return null;
  return decoded;
}

export function parseXoredEsportexData(bytes: ArrayBuffer): EsportexData | null {
  try {
    const encoded = new Uint8Array(bytes);
    const decoded = new Uint8Array(encoded.length);
    for (let index = 0; index < encoded.length; index += 1) {
      decoded[index] = encoded[index] ^ XOR_KEY;
    }

    const parsed: unknown = JSON.parse(new TextDecoder().decode(decoded));
    if (!parsed || typeof parsed !== "object") return null;

    const data = parsed as Partial<EsportexData>;
    if (typeof data.id !== "string") return null;
    if (typeof data.type !== "string") return null;
    if (typeof data.url !== "string") return null;
    return { id: data.id, type: data.type, url: data.url };
  } catch {
    return null;
  }
}

export function parseEmbedhdFid(html: string): string | null {
  const match = html.match(/\bfid\s*=\s*(["'])([A-Za-z0-9_-]+)\1/);
  return match?.[2] ?? null;
}

function extractQuotedPieces(source: string): string {
  let out = "";
  for (const match of source.matchAll(/(["'])(.*?)\1/g)) {
    out += match[2]
      .replace(/\\\//g, "/")
      .replace(/\\x([0-9a-fA-F]{2})/g, (_item, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16))
      )
      .replace(/\\u([0-9a-fA-F]{4})/g, (_item, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16))
      )
      .replace(/\\([\\'"bfnrtv0])/g, (_item, value: string) => {
        switch (value) {
          case "b":
            return "\b";
          case "f":
            return "\f";
          case "n":
            return "\n";
          case "r":
            return "\r";
          case "t":
            return "\t";
          case "v":
            return "\v";
          case "0":
            return "\0";
          default:
            return value;
        }
      });
  }
  return out;
}

export function parseExposestratHlsUrl(html: string): string | null {
  const returnArrays = html.matchAll(/return\s*\(\s*\[([\s\S]*?)\]\.join\(\s*(["'])\2\s*\)/g);

  for (const match of returnArrays) {
    const candidate = extractQuotedPieces(match[1]);
    if (!candidate) continue;

    try {
      const url = new URL(candidate);
      if (isAllowedMediaUrl(url) && /\.m3u8(?:$|[?#])/i.test(url.pathname)) return url.href;
    } catch {
      // Keep scanning for the player URL.
    }
  }

  return null;
}

function isEmbedhdSource(url: URL): boolean {
  return isAllowedEmbedUrl(url)
    && url.hostname === EMBEDHD_HOST
    && url.pathname === "/source/fetch.php"
    && url.searchParams.has("hd");
}

async function textFromFetch(response: Response): Promise<string | null> {
  if (!response.ok) return null;
  return response.text();
}

async function resolveEsportexData(
  target: URL,
  {
    signal,
    fetcher = fetchWithTimeout,
  }: {
    readonly signal?: AbortSignal;
    readonly fetcher?: Fetcher;
  } = {},
): Promise<ResolvedEsportexData | null> {
  const hashToken = esportexHashToken(target);
  const playerId = decodeEsportexPlayerId(target);
  if (!hashToken || !playerId) return null;

  const dataUrl = new URL(SPORTEX_DATA_URL);
  dataUrl.searchParams.set("id", hashToken);

  const dataHeaders = new Headers(browserHeaders(dataUrl, SPORTEX_ORIGIN));
  dataHeaders.set("accept", "application/octet-stream,*/*;q=0.8");

  const dataResponse = await fetcher(dataUrl, {
    signal,
    headers: dataHeaders,
    redirect: "follow",
    cache: "no-store",
    timeoutMs: PROXY_FETCH_TIMEOUT_MS,
  });
  if (!dataResponse.ok) return null;

  const data = parseXoredEsportexData(await dataResponse.arrayBuffer());
  if (!data || data.id !== playerId || data.type !== "iframe") return null;
  return { playerId, data };
}

function resolveEmbedFromData(resolved: ResolvedEsportexData): ResolvedEsportexEmbed | null {
  if (!resolved?.playerId.startsWith("ppv/")) return null;

  let embedUrl: URL;
  try {
    embedUrl = new URL(resolved.data.url);
  } catch {
    return null;
  }

  if (!isAllowedEmbedUrl(embedUrl)) return null;
  if (embedUrl.hostname !== "embedindia.st") return null;
  if (!embedUrl.pathname.startsWith("/embed/")) return null;

  return { embedUrl, playerId: resolved.playerId };
}

async function resolveHlsFromData(
  resolved: ResolvedEsportexData,
  {
    signal,
    fetcher = fetchWithTimeout,
  }: {
    readonly signal?: AbortSignal;
    readonly fetcher?: Fetcher;
  } = {},
): Promise<ResolvedEsportexHls | null> {
  if (!resolved?.playerId.startsWith("ehd/")) return null;
  const { data, playerId } = resolved;

  let embedhdUrl: URL;
  try {
    embedhdUrl = new URL(data.url);
  } catch {
    return null;
  }
  if (!isEmbedhdSource(embedhdUrl)) return null;

  const embedhdResponse = await fetcher(embedhdUrl, {
    signal,
    headers: browserHeaders(embedhdUrl, SPORTEX_ORIGIN),
    redirect: "follow",
    cache: "no-store",
    timeoutMs: PROXY_FETCH_TIMEOUT_MS,
  });
  const embedhdHtml = await textFromFetch(embedhdResponse);
  if (!embedhdHtml) return null;

  const fid = parseEmbedhdFid(embedhdHtml);
  if (!fid) return null;

  const exposestratUrl = new URL("/maestrohd1.php", EXPOSESTRAT_ORIGIN);
  exposestratUrl.searchParams.set("player", "desktop");
  exposestratUrl.searchParams.set("live", fid);

  const exposestratResponse = await fetcher(exposestratUrl, {
    signal,
    headers: browserHeaders(exposestratUrl, EMBEDHD_ORIGIN),
    redirect: "follow",
    cache: "no-store",
    timeoutMs: PROXY_FETCH_TIMEOUT_MS,
  });
  const exposestratHtml = await textFromFetch(exposestratResponse);
  if (!exposestratHtml) return null;

  const hlsRaw = parseExposestratHlsUrl(exposestratHtml);
  if (!hlsRaw) return null;

  try {
    const hlsUrl = new URL(hlsRaw);
    if (!isAllowedMediaUrl(hlsUrl)) return null;
    if (!/\.m3u8(?:$|[?#])/i.test(hlsUrl.pathname)) return null;
    if (hlsUrl.hostname !== "zohanayaan.com" && !hlsUrl.hostname.endsWith(".zohanayaan.com")) {
      return null;
    }
    if (new URL(exposestratResponse.url).hostname !== EXPOSESTRAT_HOST) return null;

    return {
      hlsUrl,
      refererOrigin: EXPOSESTRAT_ORIGIN,
      playerId,
      fid,
    };
  } catch {
    return null;
  }
}

export async function resolveEsportexPlayer(
  target: URL,
  options: {
    readonly signal?: AbortSignal;
    readonly fetcher?: Fetcher;
  } = {},
): Promise<ResolvedEsportexPlayer | null> {
  const resolved = await resolveEsportexData(target, options);
  if (!resolved) return null;

  const embed = resolveEmbedFromData(resolved);
  if (embed) return { kind: "embed", ...embed };

  const hls = await resolveHlsFromData(resolved, options);
  return hls ? { kind: "hls", ...hls } : null;
}

export async function resolveEsportexEmbed(
  target: URL,
  options: {
    readonly signal?: AbortSignal;
    readonly fetcher?: Fetcher;
  } = {},
): Promise<ResolvedEsportexEmbed | null> {
  const resolved = await resolveEsportexData(target, options);
  return resolved ? resolveEmbedFromData(resolved) : null;
}

export async function resolveEsportexHls(
  target: URL,
  options: {
    readonly signal?: AbortSignal;
    readonly fetcher?: Fetcher;
  } = {},
): Promise<ResolvedEsportexHls | null> {
  const resolved = await resolveEsportexData(target, options);
  return resolved ? resolveHlsFromData(resolved, options) : null;
}
