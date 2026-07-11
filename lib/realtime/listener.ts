import { Client as PgClient } from "pg";
import { WORKSPACE_CHANNEL } from "./kinds";
import type { Kind } from "./kinds";

export type Writer = (data: string) => void;
export type FanoutMap = Map<string, Set<Writer>>;

// ─── Pure helpers (testable, no module state) ────────────────────────────────

export function addSubscriber(map: FanoutMap, workspaceId: string, writer: Writer): void {
  const set = map.get(workspaceId) ?? new Set<Writer>();
  set.add(writer);
  map.set(workspaceId, set);
}

export function removeSubscriber(map: FanoutMap, workspaceId: string, writer: Writer): void {
  const set = map.get(workspaceId);
  if (!set) return;
  set.delete(writer);
  if (set.size === 0) map.delete(workspaceId);
}

export function dispatch(
  map: FanoutMap,
  payload: { workspaceId: string; kind: Kind },
): void {
  const set = map.get(payload.workspaceId);
  if (!set) return;
  const data = `data: ${JSON.stringify({ kind: payload.kind })}\n\n`;
  for (const writer of set) {
    try {
      writer(data);
    } catch {
      // Writer errors (closed stream) are handled by the SSE handler's cleanup
      // path. Don't let one bad writer abort the fanout to its neighbours.
    }
  }
}

// ─── Singleton (side-effecty; survives next dev hot-reload via globalThis) ───

type ListenerState = {
  client: PgClient | null;
  map: FanoutMap;
  connecting: Promise<void> | null;
};

const GLOBAL_KEY = "__kanblamRealtimeListener" as const;

function getState(): ListenerState {
  const g = globalThis as unknown as { [GLOBAL_KEY]?: ListenerState };
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { client: null, map: new Map(), connecting: null };
  }
  return g[GLOBAL_KEY]!;
}

async function ensureClient(): Promise<void> {
  const state = getState();
  if (state.client) return;
  if (state.connecting) return state.connecting;

  state.connecting = (async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("DATABASE_URL not set; realtime listener cannot start");
    const client = new PgClient({ connectionString: dbUrl });
    try {
      await client.connect();
      await client.query(`LISTEN ${WORKSPACE_CHANNEL}`);
      client.on("notification", (msg) => {
        if (msg.channel !== WORKSPACE_CHANNEL || !msg.payload) return;
        try {
          const parsed = JSON.parse(msg.payload) as { workspaceId: string; kind: Kind };
          dispatch(state.map, parsed);
        } catch (err) {
          console.warn("[realtime] malformed notification payload", err);
        }
      });
      client.on("error", (err) => {
        console.warn("[realtime] listener client error; will reconnect on next subscribe", err);
        const dead = state.client;
        // IMPORTANT: do NOT replace state.map here. Outstanding unsubscribe closures
        // captured the current map reference (via subscribe()'s returned closure);
        // recreating it would orphan their cleanup and leak dead writers in the new map.
        state.client = null;
        // Best-effort cleanup of the dead client. Both calls are safe on an already
        // broken client — pg swallows internally. Without this we'd leak the
        // notification listener (which closes over state.map) and the TCP fd.
        dead?.removeAllListeners();
        dead?.end().catch(() => {});
      });
      state.client = client;
      console.log("[realtime] listener connected");
    } catch (err) {
      // Half-built — drop listeners and end before propagating.
      client.removeAllListeners();
      await client.end().catch(() => {});
      throw err;
    }
  })();

  try {
    await state.connecting;
  } finally {
    state.connecting = null;
  }
}

/**
 * Subscribe a writer to receive events for one workspace. Returns an
 * unsubscribe function that the caller MUST invoke on stream close — failing
 * to do so leaks dead writers in the fanout map.
 */
export async function subscribe(workspaceId: string, writer: Writer): Promise<() => void> {
  await ensureClient();
  const state = getState();
  addSubscriber(state.map, workspaceId, writer);
  return () => removeSubscriber(state.map, workspaceId, writer);
}
