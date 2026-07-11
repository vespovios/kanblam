import Link from "next/link";

/**
 * Checkout cancel landing — the back-button target (`return_url`) when a user
 * abandons the Polar checkout. Deliberately minimal and **PII-free**: it reads
 * nothing about the user or their billing state, just offers a way back.
 *
 * Lives under the authenticated app — never instrumented (no analytics).
 */
export default function CheckoutCancelPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Checkout canceled</h1>
      <p className="text-muted-foreground">
        No charge was made. You can start again whenever you&apos;re ready.
      </p>
      <div className="pt-2">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to your workspace
        </Link>
      </div>
    </div>
  );
}
