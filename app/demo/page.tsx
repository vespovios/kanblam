import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { DemoLauncher } from "@/components/demo/demo-launcher";

/** /demo — Vikunja-style instant demo. Only served on DEMO_MODE
 *  deployments (try.kanblam.com); 404s everywhere else. Never indexed:
 *  each visit creates a tenant, and crawlers don't need task boards. */

export const metadata: Metadata = {
  title: "Try KanBlam — live demo",
  robots: { index: false, follow: false },
};

// DEMO_MODE is read per-request (the flag differs between deployments of
// the same build), so opt out of static prerendering.
export const dynamic = "force-dynamic";

export default function DemoPage() {
  if (process.env.DEMO_MODE !== "1") notFound();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-foreground">
      <span className="mb-8 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/5">
        <Image
          src="/kanblam-logo2.jpg"
          alt="KanBlam!"
          width={400}
          height={120}
          className="block h-10 w-auto"
          priority
        />
      </span>
      <h1 className="mb-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
        Welcome to the KanBlam demo!
      </h1>
      <p className="mb-10 max-w-md text-center text-muted-foreground">
        We&apos;re setting up a throwaway workspace with a real mission in it —
        no signup, no email, gone within a day.
      </p>
      <DemoLauncher />
    </div>
  );
}
