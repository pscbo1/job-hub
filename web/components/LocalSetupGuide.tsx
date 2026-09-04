import { Card, CardSub, CardTitle } from "@/components/ui/card";

const REPO = "https://github.com/pscbo1/job-hub";

/**
 * Shown wherever the local engine isn't reachable. On the hosted demo this is
 * the normal state: scraping, the local LLM, and PDF builds all run on YOUR
 * machine by design (private credentials, Cloudflare-gated portals, local
 * models) — so guide the visitor to a 5-minute local setup instead of
 * dead-ending them.
 */
export function LocalSetupGuide({ context = "This feature" }: { context?: string }) {
  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>Run the engine locally</CardTitle>
        <CardSub className="mt-1">
          {context} needs the local engine. Job Hub is{" "}
          <strong>local-first by design</strong> — your portal credentials, scraped data, and
          the AI model never leave your machine, so the hosted demo only shows the surface.
        </CardSub>
      </div>

      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
        <li>
          Clone &amp; install:{" "}
          <code className="rounded bg-night px-1.5 py-0.5 font-mono text-xs text-brand-400">
            git clone {REPO}.git && cd job-hub && uv sync --all-extras
          </code>
        </li>
        <li>
          Install the browser:{" "}
          <code className="rounded bg-night px-1.5 py-0.5 font-mono text-xs text-brand-400">
            uv run playwright install chromium
          </code>
        </li>
        <li>
          Configure: <code className="font-mono text-xs">cp .env.example .env</code> and fill in
          your portal + Telegram credentials.
        </li>
        <li>
          Sign in once:{" "}
          <code className="rounded bg-night px-1.5 py-0.5 font-mono text-xs text-brand-400">
            uv run job-sentinel login
          </code>{" "}
          (credentials prefill; you just clear the challenge).
        </li>
        <li>
          Start everything:{" "}
          <code className="rounded bg-night px-1.5 py-0.5 font-mono text-xs text-brand-400">
            uv run job-sentinel web --watch
          </code>{" "}
          → this exact app on <code className="font-mono text-xs">localhost:3000</code>, fully
          powered.
        </li>
      </ol>

      <div className="flex flex-wrap gap-3 text-sm">
        <a
          href={`${REPO}#-quick-start`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-brand px-4 py-2 font-medium text-white transition-colors hover:bg-brand-500"
        >
          Full setup guide →
        </a>
        <a
          href="https://github.com/pscbo1/job-hub"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-line px-4 py-2 font-medium text-ink transition-colors hover:border-ink/30 hover:bg-surface"
        >
          Documentation
        </a>
      </div>
    </Card>
  );
}
