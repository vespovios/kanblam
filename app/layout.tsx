import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/app-shell/theme-provider";
import { PostHogProvider } from "@/components/analytics/posthog-provider";
import "./globals.css";

/** Self-hosted webfonts via next/font/google so the app renders identically
 *  on every OS instead of falling back to whatever system font each visitor
 *  happens to have (San Francisco on macOS, Segoe UI on Windows, …). The
 *  CSS variables `--font-sans` and `--font-geist-mono` are read by the
 *  Tailwind @theme block in globals.css. */
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KanBlam!",
  description: "Move work. Clear blockers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // PostHog keys are server-injected (no NEXT_PUBLIC_ prefix needed) and
  // passed down as props. Empty values → provider becomes a no-op,
  // appropriate default for self-hosters who haven't opted in.
  const posthogKey = process.env.POSTHOG_KEY;
  const posthogHost = process.env.POSTHOG_HOST;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="font-sans antialiased">
        <ThemeProvider>
          <PostHogProvider apiKey={posthogKey} apiHost={posthogHost}>
            <SessionProvider>{children}</SessionProvider>
          </PostHogProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
