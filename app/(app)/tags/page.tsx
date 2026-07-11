import { requireUser } from "@/lib/auth/permissions";
import { listTags } from "@/lib/tags/service";
import { TagsList } from "@/components/tags/tags-list";
import { PageRealtimeBridge } from "@/components/realtime/page-realtime-bridge";

export default async function TagsPage() {
  const user = await requireUser();
  const tags = await listTags(user.workspaceId);
  return (
    <div className="space-y-4">
      <PageRealtimeBridge kinds={["tags", "tasks"]} />
      <div>
        <h2 className="text-2xl font-semibold">Tags</h2>
        <p className="text-sm text-muted-foreground">
          Cross-cutting labels for your tasks. Auto-coloured from name. Click the swatch to override.
        </p>
      </div>
      <TagsList initial={tags} />
    </div>
  );
}
