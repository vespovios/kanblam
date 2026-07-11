import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// Mock auth() BEFORE importing the route
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

// Mock the mailer — the suite must be hermetic. CI has no SMTP sink, and a
// live MailHog isn't reliably reachable anyway: Node resolves `localhost`
// to ::1 first, and Colima's Docker port-forwarding only answers on IPv4
// (found the hard way, 2026-07-07 — ECONNREFUSED ::1:1025 despite the
// container showing an [::]:1025 binding).
vi.mock("@/lib/email/send", () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

import { auth } from "@/auth";
import { sendMail } from "@/lib/email/send";
import { POST } from "@/app/api/invite/route";

const prisma = new PrismaClient();

let workspaceId: string;
let adminId: string;
let memberId: string;

beforeAll(async () => {
  await prisma.invite.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();

  const ws = await prisma.workspace.create({ data: { name: "TestWS" } });
  const admin = await prisma.user.create({
    data: { workspaceId: ws.id, email: "admin@api.test", role: "ADMIN" },
  });
  const member = await prisma.user.create({
    data: { workspaceId: ws.id, email: "member@api.test", role: "MEMBER" },
  });
  workspaceId = ws.id;
  adminId = admin.id;
  memberId = member.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/invite", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await POST(makeRequest({ email: "x@y.com" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for members", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: memberId, email: "member@api.test", workspaceId, role: "MEMBER" },
      expires: new Date(Date.now() + 86400_000).toISOString(),
    } as any);
    const res = await POST(makeRequest({ email: "x@y.com" }));
    expect(res.status).toBe(403);
  });

  it("creates an invite for admins and returns 201", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: adminId, email: "admin@api.test", workspaceId, role: "ADMIN" },
      expires: new Date(Date.now() + 86400_000).toISOString(),
    } as any);
    const res = await POST(makeRequest({ email: "brandnew@api.test" }));
    expect(res.status).toBe(201);
    expect(vi.mocked(sendMail)).toHaveBeenCalledOnce();
    const count = await prisma.invite.count({ where: { email: "brandnew@api.test" } });
    expect(count).toBe(1);
  });

  it("returns 400 on invalid email", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: adminId, email: "admin@api.test", workspaceId, role: "ADMIN" },
      expires: new Date(Date.now() + 86400_000).toISOString(),
    } as any);
    const res = await POST(makeRequest({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });
});
