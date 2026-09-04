import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compliance",
  description:
    "How Job Hub relates to GDPR/CCPA, the EU AI Act, and NYC Local Law 144 — a candidate-side tool, not a high-risk hiring system.",
};

export default function Compliance() {
  return (
    <>
      <h2 className="!mt-0">Compliance</h2>
      <p>
        Job Hub&rsquo;s compliance posture follows directly from what it is: a{" "}
        <strong>candidate-side, local-first assistant</strong>. This is the honest map of what applies
        and why.
      </p>

      <h2>What kind of tool this is (and isn&rsquo;t)</h2>
      <p>Job Hub helps a <strong>job seeker</strong>:</p>
      <ul>
        <li>monitor portals and search public job sources,</li>
        <li>track their own applications, and</li>
        <li>tailor their own résumé and cover letters.</li>
      </ul>
      <p>
        It is <strong>not an Automated Employment Decision Tool (AEDT)</strong>: it does not screen,
        score, rank, or filter <em>other</em> candidates on an employer&rsquo;s behalf, and it makes no
        hiring decisions about anyone. That distinction is what determines which laws attach.
      </p>

      <h2>EU AI Act</h2>
      <p>
        The EU AI Act classifies AI systems used by <em>employers</em> to recruit or evaluate
        candidates as high-risk. A candidate-side tool that organizes <em>your own</em> search is not in
        that high-risk category. The Act&rsquo;s general <strong>transparency</strong> duty — making
        clear when you&rsquo;re interacting with AI and when content is AI-generated — is the part we
        honor: AI-written output is labeled, and we apply a strict no-fabrication contract so the model
        only rephrases facts already in your profile.
      </p>

      <h2>NYC Local Law 144</h2>
      <p>
        Local Law 144 (bias audits for AEDTs) targets <em>employers and employment agencies</em> using
        AI to screen candidates. It does not apply to a job seeker&rsquo;s personal assistant.
      </p>

      <h2>Data protection (GDPR / CCPA)</h2>
      <p>These principles apply to personal data, and the local-first design satisfies them by construction:</p>
      <table>
        <thead>
          <tr><th>Principle</th><th>How Job Hub meets it</th></tr>
        </thead>
        <tbody>
          <tr><td>Data minimization</td><td>Only what you enter or fetch is stored — locally.</td></tr>
          <tr><td>Storage limitation</td><td>Everything lives in local files you control; we run no servers holding it.</td></tr>
          <tr><td>Right to erasure</td><td>Every record is deletable in-app; nothing is baked into model weights.</td></tr>
          <tr><td>No secondary use</td><td>No telemetry, no analytics, no third-party sharing.</td></tr>
          <tr><td>Security</td><td>Secrets stay local and unlogged; responses never leak internal detail.</td></tr>
          <tr><td>Transparency</td><td>Generated documents record which model produced them; AI output is labeled.</td></tr>
        </tbody>
      </table>

      <h2>Ethical guardrails (self-imposed)</h2>
      <ul>
        <li><strong>No fabrication</strong> — the tailoring contract forbids inventing employers, titles, dates, metrics, or skills.</li>
        <li><strong>No auto-submit, no CAPTCHA-defeating, no detection evasion</strong> — human-in-the-loop for every application.</li>
        <li><strong>Scrapers are opt-in and ToS-disclaimed</strong> — legal/free APIs are the default.</li>
      </ul>

      <p className="text-sm text-muted">
        This page is informational, not legal advice. For the engineering detail behind these claims,
        see the <a href="/legal/trust">Trust &amp; Security</a> page and the project&rsquo;s{" "}
        <a href="https://harshitwandhare.github.io/job-sentinel/compliance/" target="_blank" rel="noopener noreferrer">
          compliance docs
        </a>
        .
      </p>
    </>
  );
}
