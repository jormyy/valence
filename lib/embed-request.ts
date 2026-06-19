export function browserHeaders(target: URL, upstreamOrigin = target.origin): HeadersInit {
  return {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    referer: `${upstreamOrigin}/`,
    origin: upstreamOrigin,
  };
}
