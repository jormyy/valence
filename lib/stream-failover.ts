import type { Stream } from "./types";

export function nextViableStream(
  streams: readonly Stream[],
  activeIndex: number,
  failedIndexes: ReadonlySet<number>,
): number {
  for (let offset = 1; offset <= streams.length; offset += 1) {
    const index = (activeIndex + offset) % streams.length;
    if (index === activeIndex) continue;
    if (streams[index]?.health === "offline" || failedIndexes.has(index)) continue;
    return index;
  }
  return -1;
}
