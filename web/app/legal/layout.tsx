import Link from "next/link";

const TABS = [
  { href: "/legal", label: "Overview" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/trust", label: "Trust & Security" },
  { href: "/legal/compliance", label: "Compliance" },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <p className="font-mono text-xs font-medium uppercase tracking-widest text-brand">
        Legal &amp; Trust
      </p>
      {/* In-section nav */}
      <nav className="mt-4 flex flex-wrap gap-1.5 border-b border-line pb-4" aria-label="Legal pages">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-full border border-line px-3 py-1 text-sm text-muted transition-colors hover:border-ink/30 hover:text-ink"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <article className="legal-prose mt-8">{children}</article>

      <p className="mt-12 border-t border-line pt-6 text-xs text-muted">
        Questions about anything on these pages?{" "}
        <a href="mailto:harshitwandhare45@gmail.com" className="text-brand hover:underline">
          harshitwandhare45@gmail.com
        </a>
        . Job Hub is open source — you can read every line at{" "}
        <a
          href="https://github.com/pscbo1/job-hub"
          className="text-brand hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          github.com/pscbo1/job-hub
        </a>
        .
      </p>
    </div>
  );
}
