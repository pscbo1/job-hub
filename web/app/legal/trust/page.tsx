import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trust & Security",
  description:
    "Job Hub's security posture: local-first by design, no telemetry, hardened supply chain, and responsible disclosure.",
};

export default function TrustCenter() {
  return (
    <>
      <h2 className="!mt-0">Trust &amp; Security</h2>
      <p>
        Security is a design choice here, not a bolt-on. The whole architecture minimizes what could
        ever go wrong with your data.
      </p>

      <h2>Privacy by architecture</h2>
      <ul>
        <li>
          <strong>Local-first.</strong> There is no central database of user résumés, applications, or
          job history — so there is no honeypot to breach. Your data lives on your machine.
        </li>
        <li>
          <strong>No telemetry or tracking.</strong> The app phones nobody home; the website sets no
          analytics or advertising cookies.
        </li>
        <li>
          <strong>You own deletion.</strong> Every record is deletable in-app, or by removing the
          local database / config files.
        </li>
      </ul>

      <h2>Secrets handling</h2>
      <ul>
        <li>API keys and credentials live only in your local <code>.env</code>.</li>
        <li>Secret fields are configured to never appear in logs or object reprs, and are masked in the UI.</li>
        <li>API responses never echo raw keys, and never leak exception or stack-trace detail to clients.</li>
      </ul>

      <h2>Supply-chain &amp; code security</h2>
      <p>Every change runs through automated gates in CI before it can merge:</p>
      <ul>
        <li><strong>CodeQL</strong> static analysis (SAST) — currently 0 open alerts.</li>
        <li><strong>gitleaks</strong> secret scanning.</li>
        <li><strong>pip-audit</strong> dependency vulnerability scanning.</li>
        <li><strong>License compliance</strong> check (strong-copyleft dependencies blocked).</li>
        <li>
          <strong>OpenSSF Scorecard</strong> and the{" "}
          <a href="https://www.bestpractices.dev/projects/13183" target="_blank" rel="noopener noreferrer">
            OpenSSF Best Practices
          </a>{" "}
          badge.
        </li>
        <li>Pinned dependencies (Docker base + tools by digest) and reproducible <code>uv.lock</code> builds.</li>
        <li>Strict typing (<code>mypy --strict</code>) and 450+ automated tests.</li>
      </ul>

      <h2>Responsible disclosure</h2>
      <p>
        Found a vulnerability? Please report it privately via our{" "}
        <a href="https://github.com/pscbo1/job-hub/security" target="_blank" rel="noopener noreferrer">
          GitHub Security
        </a>{" "}
        page or by emailing{" "}
        <a href="mailto:harshitwandhare45@gmail.com">harshitwandhare45@gmail.com</a> — see{" "}
        <a href="https://github.com/pscbo1/job-hub/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer">
          SECURITY.md
        </a>
        . Please don&rsquo;t open public issues for security reports.
      </p>

      <h2>Open source = auditable</h2>
      <p>
        You don&rsquo;t have to take our word for any of this. The entire codebase is public and
        MIT-licensed — read it, run it, and verify the privacy claims yourself at{" "}
        <a href="https://github.com/pscbo1/job-hub" target="_blank" rel="noopener noreferrer">
          github.com/pscbo1/job-hub
        </a>
        . For our regulatory posture, see the{" "}
        <a href="/legal/compliance">Compliance</a> page.
      </p>
    </>
  );
}
