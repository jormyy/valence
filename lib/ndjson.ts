export async function readNdjson<T>(
  body: ReadableStream<Uint8Array>,
  onValue: (value: T) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  try {
    while (!signal?.aborted) {
      const chunk = await reader.read();
      if (signal?.aborted) return;
      pending += decoder.decode(chunk.value, { stream: !chunk.done });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) onValue(JSON.parse(line) as T);
      }
      if (chunk.done) {
        if (pending.trim()) onValue(JSON.parse(pending) as T);
        return;
      }
    }
  } finally {
    if (signal?.aborted) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
