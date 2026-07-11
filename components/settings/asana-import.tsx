"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Settings → Import from Asana. Four steps: paste token → pick project +
 *  mapping → preview → import. The Asana token lives only in this component's
 *  state and is sent with each request; it is never persisted server-side. */

type Step = "token" | "pick" | "preview" | "done";
type Mode = "sections-as-projects" | "one-project";

interface AsanaProject {
  gid: string;
  name: string;
}
interface Preview {
  sourceProject: string;
  mode: Mode;
  projects: { name: string; taskCount: number; completedCount: number }[];
  tags: string[];
  totalTasks: number;
  totalSubtasks: number;
  clashes: string[];
}
interface ImportResult {
  projectsCreated: number;
  tasksCreated: number;
  subtasksCreated: number;
  tagsCreated: number;
}

const MODE_LABEL: Record<Mode, string> = {
  "sections-as-projects": "Each Asana section becomes its own project",
  "one-project": "One project — sections kept as tags",
};

export function AsanaImport() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("token");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [token, setToken] = useState("");
  const [projects, setProjects] = useState<AsanaProject[]>([]);
  const [selectedGid, setSelectedGid] = useState("");
  const [mode, setMode] = useState<Mode>("sections-as-projects");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function call<T>(url: string, payload: unknown): Promise<T | null> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return null;
      }
      return data as T;
    } catch {
      setError("Network error — please try again.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function connect() {
    const data = await call<{ projects: AsanaProject[] }>(
      "/api/import/asana/projects",
      { token },
    );
    if (!data) return;
    if (data.projects.length === 0) {
      setError("No Asana projects found for that token.");
      return;
    }
    setProjects(data.projects);
    setSelectedGid(data.projects[0].gid);
    setStep("pick");
  }

  async function runPreview() {
    const data = await call<{ preview: Preview }>("/api/import/asana/preview", {
      token,
      projectGid: selectedGid,
      mode,
    });
    if (!data) return;
    setPreview(data.preview);
    setStep("preview");
  }

  async function commit() {
    const data = await call<{ result: ImportResult }>("/api/import/asana/commit", {
      token,
      projectGid: selectedGid,
      mode,
    });
    if (!data) return;
    setResult(data.result);
    setStep("done");
    toast.success("Import complete");
    router.refresh();
  }

  function reset() {
    setStep("token");
    setToken("");
    setProjects([]);
    setSelectedGid("");
    setPreview(null);
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h3 className="font-semibold">Import from Asana</h3>
        <p className="text-sm text-muted-foreground">
          Bring an Asana project into KanBlam — tasks, sections, due dates and
          subtasks. Your Asana token is used once to read the project and is
          never stored.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Step 1 — token */}
      {step === "token" && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label htmlFor="asana-token" className="text-xs">
              Asana personal access token
            </Label>
            <Input
              id="asana-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="2/1234…"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Create one in Asana → Settings → Apps → Developer console →
              Personal access tokens.
            </p>
          </div>
          <Button onClick={connect} disabled={loading || token.trim() === ""}>
            {loading ? "Connecting…" : "Connect to Asana"}
          </Button>
        </div>
      )}

      {/* Step 2 — pick project + mode */}
      {step === "pick" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Asana project</Label>
            <Select
              value={selectedGid}
              onValueChange={(v) => {
                if (v) setSelectedGid(v);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: string) =>
                    projects.find((p) => p.gid === v)?.name ?? "Select a project"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.gid} value={p.gid}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">How should sections map?</Label>
            <Select
              value={mode}
              onValueChange={(v) => {
                if (v) setMode(v as Mode);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: string) => MODE_LABEL[v as Mode] ?? "Select"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sections-as-projects">
                  {MODE_LABEL["sections-as-projects"]}
                </SelectItem>
                <SelectItem value="one-project">
                  {MODE_LABEL["one-project"]}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset} disabled={loading}>
              Back
            </Button>
            <Button onClick={runPreview} disabled={loading || selectedGid === ""}>
              {loading ? "Loading…" : "Preview import"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 — preview */}
      {step === "preview" && preview && (
        <div className="space-y-3">
          <p className="text-sm">
            From Asana project <strong>{preview.sourceProject}</strong> — this
            will create{" "}
            <strong>
              {preview.projects.length} project
              {preview.projects.length === 1 ? "" : "s"}
            </strong>{" "}
            and <strong>{preview.totalTasks} tasks</strong>
            {preview.totalSubtasks > 0
              ? ` (${preview.totalSubtasks} subtasks)`
              : ""}
            {preview.tags.length > 0
              ? `, tagged across ${preview.tags.length} section tags`
              : ""}
            :
          </p>
          <ul className="space-y-1 text-sm">
            {preview.projects.map((p) => (
              <li
                key={p.name}
                className="flex justify-between rounded-md border bg-background px-3 py-1.5"
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">
                  {p.taskCount} task{p.taskCount === 1 ? "" : "s"}
                  {p.completedCount > 0 ? ` · ${p.completedCount} done` : ""}
                </span>
              </li>
            ))}
          </ul>
          {preview.clashes.length > 0 && (
            <p role="alert" className="text-sm text-destructive">
              A project named {preview.clashes.map((c) => `"${c}"`).join(", ")}{" "}
              already exists. Rename or remove it before importing.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("pick")} disabled={loading}>
              Back
            </Button>
            <Button
              onClick={commit}
              disabled={loading || preview.clashes.length > 0}
            >
              {loading ? "Importing…" : "Import"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4 — done */}
      {step === "done" && result && (
        <div className="space-y-3">
          <p className="text-sm">
            Imported <strong>{result.projectsCreated}</strong> project
            {result.projectsCreated === 1 ? "" : "s"} and{" "}
            <strong>{result.tasksCreated}</strong> tasks
            {result.subtasksCreated > 0
              ? ` (${result.subtasksCreated} subtasks)`
              : ""}
            {result.tagsCreated > 0 ? `, ${result.tagsCreated} new tags` : ""}.
          </p>
          <Button variant="outline" onClick={reset}>
            Import another project
          </Button>
        </div>
      )}
    </div>
  );
}
