import Link from "next/link";

/** Shared layout for the (legal) route group — /privacy and /terms get
 *  the docs header without the sidebar, prose at a comfortable reading
 *  width. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
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
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium text-muted-foreground">
            <Link href="/docs" className="hover:text-foreground">Docs</Link>
            <Link href="/login" className="hover:text-foreground">Log in</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10 prose prose-slate dark:prose-invert">
        {children}
      </main>
    </div>
  );
}
