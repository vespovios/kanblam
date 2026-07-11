/**
 * agent-smoke.mjs — end-to-end exercise of the public API, behaving exactly
 * the way an Agent Member will: authenticate with a token, create work,
 * move it across the board, tick the checklist, report progress in prose.
 * Doubles as living documentation of the client pattern.
 *
 * Usage (against a running instance, with a read+write token):
 *   KB_TOKEN=kb_… [KB_API=http://localhost:3000/api/v1] node scripts/agent-smoke.mjs
 *
 * Cleans up after itself (deletes its smoke project, cascade removes the
 * task). Exits non-zero on the first failed expectation.
 */

const API = process.env.KB_API ?? "http://localhost:3000/api/v1";
const TOKEN = process.env.KB_TOKEN;
if (!TOKEN) {
  console.error("Set KB_TOKEN to a read+write API token (Settings → API tokens).");
  process.exit(1);
}

let failures = 0;
const ok = (label) => console.log(`  ✓ ${label}`);
const die = (label, detail) => {
  console.error(`  ✗ ${label}`, detail ?? "");
  failures++;
  throw new Error(label);
};

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      ...(body !== undefined && { "content-type": "application/json" }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function expect(label, method, path, body, wantStatus) {
  const { status, json } = await call(method, path, body);
  if (status !== wantStatus) die(label, `→ ${status} ${JSON.stringify(json)?.slice(0, 200)}`);
  ok(label);
  return json;
}

let projectId = null;
try {
  console.log(`Agent smoke test against ${API}\n`);

  // 1. Who/where am I?
  const ws = await expect("read the workspace", "GET", "/workspace", undefined, 200);
  console.log(`    workspace: "${ws.workspace.name}"`);

  // 2. Learn the board's vocabulary (id ↔ name maps).
  const { stages } = await expect("read the stages", "GET", "/stages", undefined, 200);
  const firstStage = stages.find((s) => !s.isTerminal);
  const nextStage = stages.find((s) => !s.isTerminal && s.id !== firstStage.id) ?? firstStage;

  // 3. A scratch project so the smoke run never touches real work.
  const code = `SMK${Date.now().toString(36).slice(-4).toUpperCase()}`;
  const proj = await expect("create a scratch project", "POST", "/projects", {
    name: "Agent smoke test",
    code,
  }, 201);
  projectId = proj.project.id;

  // 4. Create a task with the minimal body — defaults do the rest.
  const created = await expect("create a task (minimal body)", "POST", "/tasks", {
    projectId,
    name: "Smoke: verify the API end-to-end",
  }, 201);
  const task = created.task;
  if (!task.assignee) die("task auto-assigned to the caller");
  ok(`task auto-assigned to "${task.assignee.name}" (the token's user)`);

  // 5. The task shows up in a filtered listing (how an agent finds its work).
  const listed = await expect(
    "find it by assignee filter",
    "GET",
    `/tasks?projectId=${projectId}&assigneeId=${task.assignee.id}`,
    undefined,
    200,
  );
  if (!listed.tasks.some((t) => t.id === task.id)) die("created task missing from listing");

  // 6. Checklist: add two items, complete one, watch progress move.
  await expect("add a checklist item", "POST", `/tasks/${task.id}/subtasks`, { title: "step one" }, 201);
  const s2 = await expect("add another", "POST", `/tasks/${task.id}/subtasks`, { title: "step two" }, 201);
  await expect("complete a checklist item", "PATCH", `/subtasks/${s2.subtask.id}`, { completed: true }, 200);
  const after = await expect("re-read the task", "GET", `/tasks/${task.id}`, undefined, 200);
  if (after.task.progressPct !== 50) die("progress recompute", `expected 50, got ${after.task.progressPct}`);
  ok("progress recomputed to 50%");

  // 7. Move the card (the realtime event makes open boards follow along).
  const moved = await expect("move the card", "POST", `/tasks/${task.id}/move`, {
    kanbanStageId: nextStage.id,
  }, 200);
  if (moved.task.stage.id !== nextStage.id) die("move landed in the wrong stage");

  // 8. Report status in prose — the Agent Member voice.
  await expect("comment on the task", "POST", `/tasks/${task.id}/comments`, {
    body: "Smoke run complete: created, listed, checked off, moved. All systems nominal. 🎈",
  }, 201);

  // 9. Guardrails hold: a foreign/unknown id is a clean 404.
  await expect("unknown ids 404 cleanly", "GET", "/tasks/not-a-real-id", undefined, 404);

  console.log("\nAll good — the board is fully drivable over the wire.");
} catch {
  process.exitCode = 1;
} finally {
  // 10. Leave no trace.
  if (projectId) {
    const { status } = await call("DELETE", `/projects/${projectId}`);
    console.log(status === 200 ? "  ✓ scratch project cleaned up" : `  ✗ cleanup failed (${status}) — delete project manually`);
    if (status !== 200) process.exitCode = 1;
  }
  if (failures > 0) process.exitCode = 1;
}
