interface PriorityLite {
  id: string;
  name: string;
}

// Workspaces are seeded with priorities at creation; this should never throw
// in practice. Throws loudly if the invariant is violated rather than letting
// an empty string flow into a `z.string().min(1)` validator and surface as a
// confusing form-submit error.
export function pickDefaultPriorityId(priorities: PriorityLite[]): string {
  const id =
    priorities.find((p) => p.name.toLowerCase() === "medium")?.id ??
    priorities[0]?.id;
  if (!id) {
    throw new Error("No priorities found for this workspace");
  }
  return id;
}
