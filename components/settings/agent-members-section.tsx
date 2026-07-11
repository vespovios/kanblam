"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { API_TOKEN_SCOPES, type ApiTokenScope } from "@/lib/validators/api-token";

/** Settings → Agent members. API-only workspace members (kind=AGENT) that
 *  can be assigned tasks and act through /api/v1 via their own tokens.
 *  Mirrors ApiTokensSection's show-once-token pattern, scoped per agent. */

export interface AgentTokenRow {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface AgentMemberRow {
  id: string;
  name: string | null;
  createdAt: string;
  apiTokens: AgentTokenRow[];
}

interface Props {
  agents: AgentMemberRow[];
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

export function AgentMembersSection({ agents }: Props) {
  const router = useRouter();

  // Create form
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Rename (inline toggle, one agent at a time)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [renaming, setRenaming] = useState(false);

  // Remove (two-click confirm)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Mint-token form (one agent at a time)
  const [mintForId, setMintForId] = useState<string | null>(null);
  const [mintName, setMintName] = useState("");
  const [mintScopes, setMintScopes] = useState<ApiTokenScope[]>(["read"]);
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);

  // Just-minted tokens, keyed by agent id — raw value plus record id so
  // revoking that same token clears its show-once box too.
  const [freshTokens, setFreshTokens] = useState<Record<string, { raw: string; id: string }>>({});

  // Token revoke (two-click confirm)
  const [confirmRevokeTokenId, setConfirmRevokeTokenId] = useState<string | null>(null);

  function toggleMintScope(scope: ApiTokenScope) {
    setMintScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    const res = await fetch("/api/settings/agent-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setCreating(false);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setCreateError(body?.error ?? "Failed to create agent");
      return;
    }
    setName("");
    router.refresh();
  }

  function startEdit(agent: AgentMemberRow) {
    setEditingId(agent.id);
    setEditName(agent.name ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    setRenaming(true);
    const res = await fetch(`/api/settings/agent-members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    setRenaming(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? "Failed to rename agent");
      return;
    }
    cancelEdit();
    router.refresh();
  }

  async function onRemove(id: string) {
    if (confirmRemoveId !== id) {
      setConfirmRemoveId(id);
      return;
    }
    setConfirmRemoveId(null);
    setRemovingId(id);
    const res = await fetch(`/api/settings/agent-members/${id}`, { method: "DELETE" });
    setRemovingId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? "Failed to remove agent");
      return;
    }
    toast.success("Agent removed");
    setFreshTokens((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    router.refresh();
  }

  function openMintForm(agentId: string) {
    setMintForId((prev) => (prev === agentId ? null : agentId));
    setMintName("");
    setMintScopes(["read"]);
    setMintError(null);
  }

  async function onMint(e: React.FormEvent, agentId: string) {
    e.preventDefault();
    if (!mintName.trim() || mintScopes.length === 0) return;
    setMinting(true);
    setMintError(null);
    const res = await fetch(`/api/settings/agent-members/${agentId}/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: mintName.trim(), scopes: mintScopes }),
    });
    setMinting(false);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setMintError(body?.error ?? "Failed to create token");
      return;
    }
    setFreshTokens((prev) => ({ ...prev, [agentId]: { raw: body.token, id: body.record.id } }));
    setMintForId(null);
    setMintName("");
    setMintScopes(["read"]);
    router.refresh();
  }

  async function onRevokeToken(agentId: string, tokenId: string) {
    if (confirmRevokeTokenId !== tokenId) {
      setConfirmRevokeTokenId(tokenId);
      return;
    }
    setConfirmRevokeTokenId(null);
    const res = await fetch(`/api/settings/agent-members/${agentId}/tokens/${tokenId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to revoke token");
      return;
    }
    toast.success("Token revoked");
    setFreshTokens((prev) => {
      if (prev[agentId]?.id !== tokenId) return prev;
      const next = { ...prev };
      delete next[agentId];
      return next;
    });
    router.refresh();
  }

  async function copyFreshToken(agentId: string) {
    const fresh = freshTokens[agentId];
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.raw);
      toast.success("Token copied");
    } catch {
      toast.error("Copy failed — select the text manually");
    }
  }

  function dismissFreshToken(agentId: string) {
    setFreshTokens((prev) => {
      const next = { ...prev };
      delete next[agentId];
      return next;
    });
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h3 className="font-semibold">Agent members</h3>
        <p className="text-sm text-muted-foreground">
          API-only members — assign them tasks, they work through the REST API.
        </p>
      </div>

      {/* create form */}
      <form onSubmit={onCreate} className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="agent-name" className="text-xs">
            Agent name
          </Label>
          <Input
            id="agent-name"
            placeholder="e.g. Flight Computer"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
        </div>
        <Button type="submit" disabled={creating || !name.trim()}>
          {creating ? "Adding…" : "Add agent"}
        </Button>
      </form>
      {createError && <p className="text-sm text-destructive">{createError}</p>}

      {/* agent list */}
      {agents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No agent members yet.</p>
      ) : (
        <ul className="space-y-3">
          {agents.map((agent) => {
            const activeTokens = agent.apiTokens.filter((t) => !t.revokedAt);
            const revokedTokens = agent.apiTokens.filter((t) => t.revokedAt);
            const fresh = freshTokens[agent.id];
            return (
              <li key={agent.id} className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1">
                    {editingId === agent.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={100}
                          className="h-8 max-w-64"
                          autoFocus
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => saveEdit(agent.id)}
                          disabled={renaming || !editName.trim()}
                        >
                          Save
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={cancelEdit}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{agent.name ?? "—"}</span>
                        <Badge variant="outline">Agent</Badge>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">Joined {fmt(agent.createdAt)}</p>
                  </div>
                  {editingId !== agent.id && (
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => startEdit(agent)}>
                        Rename
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openMintForm(agent.id)}
                      >
                        New token
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={confirmRemoveId === agent.id ? "destructive" : "outline"}
                        onClick={() => onRemove(agent.id)}
                        onBlur={() => setConfirmRemoveId(null)}
                        disabled={removingId === agent.id}
                      >
                        {confirmRemoveId === agent.id ? "Confirm remove" : "Remove"}
                      </Button>
                    </div>
                  )}
                </div>

                {/* show-once box for a freshly minted token */}
                {fresh && (
                  <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
                    <p className="text-sm font-medium">
                      Copy your new token now — it won&apos;t be shown again.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-xs">
                        {fresh.raw}
                      </code>
                      <Button type="button" size="sm" onClick={() => copyFreshToken(agent.id)}>
                        Copy
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => dismissFreshToken(agent.id)}
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                )}

                {/* mint-token form */}
                {mintForId === agent.id && (
                  <form onSubmit={(e) => onMint(e, agent.id)} className="space-y-3 rounded-md bg-muted/40 p-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-48 flex-1 space-y-1.5">
                        <Label htmlFor={`token-name-${agent.id}`} className="text-xs">
                          Token name
                        </Label>
                        <Input
                          id={`token-name-${agent.id}`}
                          placeholder="e.g. production runtime"
                          value={mintName}
                          onChange={(e) => setMintName(e.target.value)}
                          maxLength={100}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <span className="block text-xs font-medium">Scopes</span>
                        <div className="flex h-9 items-center gap-4">
                          {API_TOKEN_SCOPES.map((scope) => (
                            <label key={scope} className="flex items-center gap-1.5 text-sm">
                              <Checkbox
                                checked={mintScopes.includes(scope)}
                                onCheckedChange={() => toggleMintScope(scope)}
                              />
                              {scope}
                            </label>
                          ))}
                        </div>
                      </div>
                      <Button type="submit" disabled={minting || !mintName.trim() || mintScopes.length === 0}>
                        {minting ? "Creating…" : "Create token"}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setMintForId(null)}>
                        Cancel
                      </Button>
                    </div>
                    {mintError && <p className="text-sm text-destructive">{mintError}</p>}
                  </form>
                )}

                {/* token list */}
                {activeTokens.length === 0 && revokedTokens.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tokens yet.</p>
                ) : (
                  <ul className="divide-y">
                    {activeTokens.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{t.name}</span>
                            {t.scopes.map((s) => (
                              <Badge key={s} variant="outline" className="text-[10px] uppercase">
                                {s}
                              </Badge>
                            ))}
                          </div>
                          <p className="font-mono text-xs text-muted-foreground">
                            {t.tokenPrefix}… · created {fmt(t.createdAt)} · last used {fmt(t.lastUsedAt)}
                            {t.expiresAt ? ` · expires ${fmt(t.expiresAt)}` : ""}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={confirmRevokeTokenId === t.id ? "destructive" : "outline"}
                          onClick={() => onRevokeToken(agent.id, t.id)}
                          onBlur={() => setConfirmRevokeTokenId(null)}
                        >
                          {confirmRevokeTokenId === t.id ? "Confirm revoke" : "Revoke"}
                        </Button>
                      </li>
                    ))}
                    {revokedTokens.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 py-2.5 opacity-55">
                        <div className="min-w-0 flex-1">
                          <span className="truncate text-sm font-medium line-through">{t.name}</span>
                          <p className="font-mono text-xs text-muted-foreground">
                            {t.tokenPrefix}… · revoked {fmt(t.revokedAt)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
