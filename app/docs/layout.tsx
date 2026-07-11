import Link from "next/link";
import { DocsSidebar } from "@/components/docs/docs-sidebar";

/** Docs layout — sticky header on top, left sidebar for navigation, prose
 *  content area on the right. On mobile the sidebar is hidden; the
 *  content takes the full viewport. When the docs surface graduates to a
 *  full Nextra theme, the layout swaps to `nextra-theme-docs`'s <Layout>. */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header
        className="sticky top-0 z-10 border-b"
        style={{
          background: "var(--header-bg)",
          borderColor: "var(--header-border)",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="text-lg font-extrabold tracking-tight">
            KanBlam!
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              docs
            </span>
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium text-muted-foreground">
            <Link href="/docs" className="hover:text-foreground">Home</Link>
            <a href="https://github.com/vespovios/kanblam" className="hover:text-foreground">GitHub</a>
            <Link href="/login" className="hover:text-foreground">Log in</Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl flex gap-0 px-6">
        <DocsSidebar />
        <main className="flex-1 min-w-0 py-8 md:pl-8 prose prose-slate dark:prose-invert max-w-none">
          {children}
        </main>
      </div>
    </div>
  );
}
