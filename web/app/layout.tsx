import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { CommandPalette } from "@/components/CommandPalette";
import { CustomCursor } from "@/components/CustomCursor";
import { Nav } from "@/components/Nav";
import { ScrollProgress } from "@/components/ScrollProgress";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://github.com/harshitwandhare/job-sentinel"),
  title: {
    default: "Job Sentinel — local-first job monitoring & AI résumé studio",
    template: "%s · Job Sentinel",
  },
  description:
    "Monitor job portals, track every posting, and generate ATS-ready résumés tailored " +
    "by a local LLM. Open source, private by default — your data never leaves your machine.",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Job Sentinel",
    description:
      "Local-first job monitoring, tracking, and AI resume tooling for your own machine.",
    images: [{ url: "/brand/sentinel.png", width: 1024, height: 1024, alt: "Job Sentinel logo" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0a09",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="has-custom-cursor font-sans">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <ScrollProgress />
        <ServiceWorkerRegistration />
        <CustomCursor />
        <CommandPalette />
        {process.env.NEXT_PUBLIC_DEMO === "1" && (
          <div className="bg-brand px-4 py-1.5 text-center text-xs font-medium text-white">
            Live demo — showing sample data.{" "}
            <a
              href="https://github.com/harshitwandhare/job-sentinel#-quick-start"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Run it locally
            </a>{" "}
            for your real jobs, profile, and a private local model.
          </div>
        )}
        <div className="md:flex md:items-start">
          <Nav />
          <div className="min-w-0 flex-1">
            <main id="content" className="min-h-screen">
              {children}
            </main>
            <footer className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <p className="flex max-w-xs items-center gap-2 text-sm text-muted">
                <img
                  src="/brand/sentinel.png"
                  alt=""
                  className="h-7 w-7 shrink-0 rounded-md object-cover"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-semibold text-ink">Job Sentinel</span> — local-first, open
                  source. Your data stays on your machine.
                </span>
              </p>
              <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted/60">Product</span>
                  <a href="https://github.com/harshitwandhare/job-sentinel" className="text-muted hover:text-ink">GitHub</a>
                  <a href="https://pypi.org/project/job-sentinel/" className="text-muted hover:text-ink">PyPI</a>
                  <a href="https://harshitwandhare.github.io/job-sentinel/" className="text-muted hover:text-ink">Docs</a>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted/60">Legal</span>
                  <a href="/legal/privacy" className="text-muted hover:text-ink">Privacy</a>
                  <a href="/legal/terms" className="text-muted hover:text-ink">Terms</a>
                  <a href="/legal/compliance" className="text-muted hover:text-ink">Compliance</a>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted/60">Resources</span>
                  <a href="/legal/trust" className="text-muted hover:text-ink">Trust &amp; Security</a>
                  <a href="/legal" className="text-muted hover:text-ink">Legal center</a>
                  <a href="https://github.com/harshitwandhare/job-sentinel/security" className="text-muted hover:text-ink">Report an issue</a>
                </div>
              </div>
            </div>
            <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-line pt-6 text-xs text-muted sm:flex-row">
              <span>© 2026 Job Sentinel · MIT License</span>
              <span>Built by Harshit Wandhare · Private by design — no telemetry, no tracking.</span>
            </div>
          </div>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
