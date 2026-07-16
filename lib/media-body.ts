export function shouldBufferMedia(target: URL, contentType: string): boolean {
  return /\.(?:ts|m4s|aac)(?:$|[?#])/i.test(target.pathname)
    || /^(?:video\/mp2t|video\/iso\.segment|audio\/aac)(?:;|$)/i.test(contentType);
}

/**
 * Prevent a late upstream read failure from rejecting Next's response pipeline.
 * Segment responses are buffered before headers instead; this is for large or
 * indefinite bodies where buffering would add material latency and memory cost.
 */
export function closeOnUpstreamFailure(
  body: ReadableStream<Uint8Array> | null,
): ReadableStream<Uint8Array> | null {
  if (!body) return null;
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) controller.close();
        else controller.enqueue(chunk.value);
      } catch {
        controller.close();
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}
