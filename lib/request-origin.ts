function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first || null;
}

function normalizedProtocol(value: string | null, fallback: string): string {
  if (!value) return fallback;
  return value.endsWith(":") ? value : `${value}:`;
}

export function publicRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = firstHeaderValue(request.headers.get("x-forwarded-host"))
    ?? firstHeaderValue(request.headers.get("host"));
  const protocol = normalizedProtocol(
    firstHeaderValue(request.headers.get("x-forwarded-proto")),
    url.protocol,
  );

  return host ? `${protocol}//${host}` : url.origin;
}
