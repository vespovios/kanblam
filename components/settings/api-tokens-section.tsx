"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { API_TOKEN_SCOPES, type ApiTokenScope } from "@/lib/validators/api-token";

/** Settings → API tokens. Per-user personal access tokens for /api/v1.
 *  The raw token is displayed exactly once, right after creation, in a
 *  copy box — after that only the prefix is ever shown. */

export interface ApiTokenRow {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface Props {
  initialTokens: ApiTokenRow[];
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

export function ApiTokensSection({ initialTokens }: Props) {
  const [tokens, setTokens] = useState<ApiTokenRow[]>(initialTokens);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiTokenScope[]>(["read"]);
  const [submitting, setSubmitting] = useState(false);
  /** The just-created token — raw value plus its record id, so revoking
   *  that same token clears the show-once box too. */
  const [freshToken, setFreshToken] = useState<{ raw: string; id: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/settings/api-tokens");
    if (res.ok) setTokens((await res.json()).tokens);
  }

  function toggleScope(scope: ApiTokenScope) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || scopes.length === 0) return;
    setSubmitting(true);
    const res = await fetch("/api/settings/api-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), scopes }),
    });
    setSubmitting(false);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(body?.error ?? "Failed to create token");
      return;
    }
    setFreshToken({ raw: body.token, id: body.record.id });
    setName("");
    setScopes(["read"]);
    await refresh();
  }

  async function onRevoke(id: string) {
    if (confirmRevoke !== id) {
      setConfirmRevoke(id);
      return;
    }
    setConfirmRevoke(null);
    const res = await fetch(`/api/settings/api-tokens/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to revoke token");
      return;
    }
    toast.success("Token revoked");
    // If the revoked token is the one in the show-once box, the box is
    // now displaying a dead secret — clear it.
    setFreshToken((prev) => (prev?.id === id ? null : prev));
    await refresh();
  }

  async function copyFreshToken() {
    if (!freshToken) return;
    try {
      await navigator.clipboard.writeText(freshToken.raw);
      toast.success("Token copied");
    } catch {
      toast.error("Copy failed — select the text manually");
    }
  }

  const active = tokens.filter((t) => !t.revokedAt);
  const revoked = tokens.filter((t) => t.revokedAt);

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h3 className="font-semibold">API tokens</h3>
        <p className="text-sm text-muted-foreground">
          Personal access tokens for the REST API. A token can do whatever
          you can do, limited by its scopes — treat it like a password.
        </p>
      </div>

      {/* show-once box for a freshly created token */}
      {freshToken && (
        <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
          <p className="text-sm font-medium">
            Copy your new token now — it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-xs">
              {freshToken.raw}
            </code>
            <Button type="button" size="sm" onClick={copyFreshToken}>
              Copy
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setFreshToken(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      {/* create form */}
      <form onSubmit={onCreate} className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1 space-y-1.5">
            <Label htmlFor="api-token-name" className="text-xs">
              Token name
            </Label>
            <Input
              id="api-token-name"
              placeholder="e.g. chase-car script"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <span className="block text-xs font-medium">Scopes</span>
            <div className="flex h-9 items-center gap-4">
              {API_TOKEN_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={scopes.includes(scope)}
                    onCheckedChange={() => toggleScope(scope)}
                  />
                  {scope}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={submitting || !name.trim() || scopes.length === 0}>
            {submitting ? "Creating…" : "Create token"}
          </Button>
        </div>
      </form>

      {/* token list */}
      {active.length === 0 && revoked.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tokens yet.</p>
      ) : (
        <ul className="divide-y">
          {active.map((t) => (
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
                variant={confirmRevoke === t.id ? "destructive" : "outline"}
                onClick={() => onRevoke(t.id)}
                onBlur={() => setConfirmRevoke(null)}
              >
                {confirmRevoke === t.id ? "Confirm revoke" : "Revoke"}
              </Button>
            </li>
          ))}
          {revoked.map((t) => (
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
    </div>
  );
}
