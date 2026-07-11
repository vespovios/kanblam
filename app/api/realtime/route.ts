import { requireWorkspaceContext, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { subscribe } from "@/lib/realtime/listener";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AGE_MS = 5 * 60 * 1000; // recycle long-lived connections

export async function GET(req: Request) {
  let ctx;
  try {
    ctx = await requireWorkspaceContext();
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return new Response(err.message, { status: err.status });
    }
    throw err;
  }
  const { workspaceId } = ctx;

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let maxAgeTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Initial event so the client knows the stream is live.
      controller.enqueue(encoder.encode(`: connected\n\n`));

      const writer = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Stream closed underneath us; cleanup is handled by cancel().
        }
      };

      unsubscribe = await subscribe(workspaceId, writer);

      // If the client disconnected during the await above, abort listeners
      // attached now wouldn't fire (per WHATWG AbortSignal: listeners added
      // after abort don't run). Clean up immediately.
      if (req.signal.aborted) {
        closed = true;
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
        return;
      }

      maxAgeTimer = setTimeout(() => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        try { controller.close(); } catch { /* already closed */ }
      }, MAX_AGE_MS);

      req.signal.addEventListener("abort", () => {
        if (closed) return;
        closed = true;
        if (maxAgeTimer) clearTimeout(maxAgeTimer);
        unsubscribe?.();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      if (closed) return;
      closed = true;
      if (maxAgeTimer) clearTimeout(maxAgeTimer);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable buffering through proxies
    },
  });
}
