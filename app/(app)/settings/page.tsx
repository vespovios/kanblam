import Link from "next/link";
import { requireUser } from "@/lib/auth/permissions";
import { features } from "@/lib/config/features";
import { prisma } from "@/lib/db";
import { TeamList } from "@/components/settings/team-list";
import { InviteForm } from "@/components/settings/invite-form";
import { WorkingDaysForm } from "@/components/settings/working-days-form";
import { WorkspaceForm } from "@/components/settings/workspace-form";
import { HolidaysSection } from "@/components/settings/holidays-section";
import { PasswordForm } from "@/components/settings/password-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { AsanaImport } from "@/components/settings/asana-import";
import { ApiTokensSection } from "@/components/settings/api-tokens-section";
import { listApiTokens } from "@/lib/api-tokens/service";
import { PageRealtimeBridge } from "@/components/realtime/page-realtime-bridge";

/** Settings page is reachable by EVERY authenticated user (not just admins
 *  as before v0.7.0) so members can change their own password. The
 *  admin-only sections (workspace name, invite, team list, working days,
 *  holidays) are gated below on `user.role === "ADMIN"`. */
export default async function SettingsPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  // Every user needs their own name + email for the Profile section.
  // session.user.name is in the token but may be stale; fetch the DB row
  // for the canonical current value.
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { name: true, email: true },
  });

  // Per-user API tokens (dates serialized for the client component).
  const apiTokens = (await listApiTokens(user.id)).map((t) => ({
    ...t,
    expiresAt: t.expiresAt?.toISOString() ?? null,
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    revokedAt: t.revokedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  }));

  // Only fetch admin-section data if the viewer is actually admin —
  // saves four queries on every member-side render.
  const [members, pendingInvites, workspace, holidays] = isAdmin
    ? await Promise.all([
        prisma.user.findMany({
          where: { workspaceId: user.workspaceId },
          orderBy: { createdAt: "asc" },
          select: { id: true, email: true, name: true, role: true, createdAt: true },
        }),
        prisma.invite.findMany({
          where: {
            workspaceId: user.workspaceId,
            acceptedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, email: true, expiresAt: true },
        }),
        prisma.workspace.findUniqueOrThrow({
          where: { id: user.workspaceId },
          select: {
            name: true,
            workingDays: true,
            holidayCountry: true,
            holidaySubdivision: true,
          },
        }),
        prisma.holiday.findMany({
          where: { workspaceId: user.workspaceId },
          orderBy: { date: "asc" },
          select: { id: true, name: true, date: true },
        }),
      ])
    : [null, null, null, null];

  const holidaysSerialized = holidays
    ? holidays.map((h) => ({
        id: h.id,
        name: h.name,
        date: h.date.toISOString().slice(0, 10),
      }))
    : [];

  return (
    <div className="space-y-8 max-w-3xl">
      <PageRealtimeBridge kinds={["working_days", "holidays", "members", "workspace"]} />
      <div>
        <h2 className="text-2xl font-semibold">Settings</h2>
        <p className="text-muted-foreground">
          {isAdmin
            ? "Manage your account and workspace preferences."
            : "Manage your account."}
        </p>
      </div>

      {/* Account section — visible to every user */}
      <ProfileForm initialName={me.name ?? ""} email={me.email} />
      <PasswordForm />
      <ApiTokensSection initialTokens={apiTokens} />
      <AsanaImport />

      {/* Workspace-admin sections — only for ADMINs */}
      {isAdmin && workspace && (
        <>
          <WorkspaceForm initial={workspace.name} />
          <InviteForm />
          {members && pendingInvites && (
            <TeamList members={members} pendingInvites={pendingInvites} />
          )}
          <WorkingDaysForm initial={workspace.workingDays} />
          <HolidaysSection
            initial={holidaysSerialized}
            initialCountry={workspace.holidayCountry}
            initialSubdivision={workspace.holidaySubdivision}
          />
          {/* Hosted-billing management — only when billing is enabled (never
              on self-host, where billing is a hard no-op). */}
          {features.billingEnabled && (
            <div className="space-y-3 rounded-lg border bg-card p-4">
              <div>
                <h3 className="font-semibold">Billing</h3>
                <p className="text-sm text-muted-foreground">
                  Manage the hosted subscription for this workspace.
                </p>
              </div>
              <Link
                href="/settings/billing"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Manage billing →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
