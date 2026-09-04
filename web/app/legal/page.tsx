import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Legal & Trust Center",
  description:
    "Job Hub's legal and trust documents — privacy, terms, security, and compliance for a local-first, open-source platform.",
};

const CARDS = [
  {
    href: "/legal/privacy",
    title: "Privacy Policy",
    body: "What we collect (almost nothing): the app is local-first, so your data stays on your machine.",
  },
  {
    href: "/legal/terms",
    title: "Terms of Service",
    body: "The MIT license, acceptable use, your responsibilities, and the no-warranty / no-auto-apply stance.",
  },
  {
    href: "/legal/trust",
    title: "Trust & Security",
    body: "Our security posture, supply-chain gates, responsible disclosure, and data ownership.",
  },
  {
    href: "/legal/compliance",
    title: "Compliance",
    body: "GDPR / CCPA, the EU AI Act, and why a candidate-side tool isn't a high-risk hiring system.",
  },
];

export default function LegalOverview() {
  return (
    <>
      <h2 className="!mt-0">Legal &amp; Trust Center</h2>
      <p>
        Job Hub is an <strong>open-source, local-first</strong> career platform. That
        architecture shapes everything here: there is no central server holding your résumé,
        applications, or job history — it lives on your own machine, and you can read every line
        of the code that touches it. These pages spell out exactly how that works.
      </p>

      <div className="mt-6 grid gap-3 not-prose sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="block rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-ink/30"
          >
            <div className="font-semibold text-ink">{c.title}</div>
            <div className="mt-1 text-sm text-muted">{c.body}</div>
          </Link>
        ))}
      </div>

      <h2>The short version</h2>
      <ul>
        <li>
          <strong>We don&rsquo;t collect your data.</strong> The self-hosted app runs on your
          hardware; we operate no servers that receive it.
        </li>
        <li>
          <strong>No telemetry, no tracking, no ad cookies.</strong> Ever.
        </li>
        <li>
          <strong>You stay in control of AI.</strong> The model runs locally by default; bring your
          own key only if you choose to, and only your prompts go to that provider.
        </li>
        <li>
          <strong>You decide where to apply.</strong> Job Hub never auto-submits applications.
        </li>
      </ul>

      <p className="text-sm text-muted">Last updated: 14 June 2026.</p>
    </>
  );
}
