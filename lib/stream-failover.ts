import type { Stream } from "./types";

export function nextViableStream(
  streams: readonly Stream[],
  activeIndex: number,
  failedUrls: ReadonlySet<string>,
): number {
  const startIndex = activeIndex >= 0 ? activeIndex : streams.length - 1;
  for (let offset = 1; offset <= streams.length; offset += 1) {
    const index = (startIndex + offset) % streams.length;
    const stream = streams[index];
    if (!stream || index === activeIndex) continue;
    if (stream.health === "offline" || failedUrls.has(stream.url)) continue;
    return index;
  }
  return -1;
}
