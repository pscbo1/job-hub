import Link from "next/link";
import { ArrowRight, ClipboardList, Compass, Search } from "lucide-react";

const actions = [
  { href: "/search", label: "Collect jobs", detail: "Search sources or import a posting.", icon: Search },
  { href: "/jobs", label: "Discover", detail: "Review new and saved opportunities.", icon: Compass },
  { href: "/applications", label: "Applications", detail: "Track drafts, submissions, and progress.", icon: ClipboardList },
];

export default function HomePage() {
  return (
    <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-24">
      <p className="text-sm font-medium text-muted">Job Hub</p>
      <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-5xl">
        Find the next useful opportunity.
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
        A focused workspace for collecting jobs, deciding what matters, and keeping applications moving.
      </p>
      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {actions.map(({ href, label, detail, icon: Icon }) => (
          <Link key={href} href={href} className="group rounded-lg border border-line bg-surface p-5 transition-colors hover:border-brand/50 hover:bg-brand/[0.03]">
            <Icon className="h-5 w-5 text-brand" aria-hidden="true" />
            <h2 className="mt-6 flex items-center gap-2 font-medium text-ink">
              {label}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{detail}</p>
          </Link>
        ))}
      </div>
      <Link href="/tasks" className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline">
        Open tasks <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
