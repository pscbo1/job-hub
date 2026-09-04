import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms for using Job Hub — MIT-licensed software provided as-is, acceptable use, and your responsibilities.",
};

export default function TermsOfService() {
  return (
    <>
      <h2 className="!mt-0">Terms of Service</h2>
      <p className="text-sm text-muted">Effective: 14 June 2026</p>

      <p>
        These terms govern your use of the Job Hub software and the hosted demo (together,
        &ldquo;the Service&rdquo;). By using the Service you agree to them. If you don&rsquo;t agree,
        don&rsquo;t use it.
      </p>

      <h2>1. The software &amp; license</h2>
      <p>
        Job Hub is open-source software released under the{" "}
        <a href="https://github.com/pscbo1/job-hub/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">
          MIT License
        </a>
        . Your rights to use, copy, modify, and distribute the code are defined by that license, which
        controls in case of any conflict with these terms regarding the code itself.
      </p>

      <h2>2. &ldquo;As is&rdquo; — no warranty</h2>
      <p>
        The Service is provided <strong>&ldquo;as is&rdquo;, without warranty of any kind</strong>,
        express or implied, including merchantability, fitness for a particular purpose, and
        non-infringement. To the maximum extent permitted by law, the maintainer is not liable for any
        damages arising from your use of the Service.
      </p>

      <h2>3. Acceptable use</h2>
      <p>You agree to use the Service lawfully and responsibly. In particular:</p>
      <ul>
        <li>
          <strong>You are responsible for third-party terms.</strong> Job sources and portals you
          connect have their own Terms of Service. The default sources use official/public APIs;
          optional scraper backends (e.g. JobSpy) and any portal automation are <strong>opt-in</strong>,
          may violate a site&rsquo;s terms, and you assume full responsibility for enabling and using
          them.
        </li>
        <li>
          You will not use the Service to infringe others&rsquo; rights, bypass authentication or
          CAPTCHAs, send spam, or for any unlawful purpose.
        </li>
        <li>
          You will keep your own credentials and API keys secure (they live in your local
          environment).
        </li>
      </ul>

      <h2>4. Human-in-the-loop; no auto-apply</h2>
      <p>
        Job Hub helps you find, track, and tailor — it <strong>does not auto-submit
        applications</strong> on your behalf. You decide where and what you apply to, and you are
        responsible for the accuracy and truthfulness of everything you submit.
      </p>

      <h2>5. AI output is not advice</h2>
      <p>
        Match scores, generated résumés, cover letters, and assistant answers are produced by
        automated models and <strong>may be inaccurate or incomplete</strong>. They are not legal,
        financial, or professional career advice. Review and verify any output before relying on it.
      </p>

      <h2>6. The hosted demo</h2>
      <p>
        The hosted demo is provided for evaluation only, on sample data, with no guarantee of
        availability — it may change or be withdrawn at any time. Don&rsquo;t enter real personal data
        into the demo; run the app locally for real use.
      </p>

      <h2>7. Third-party services</h2>
      <p>
        When you enable an LLM provider, job source, or notifier, your use of those services is
        governed by their terms and policies, not these.
      </p>

      <h2>8. Changes &amp; governing law</h2>
      <p>
        We may update these terms; material changes will be noted here. To the extent a governing law
        is needed, these terms are governed by the laws of the State of Texas, USA, without regard to
        conflict-of-laws rules. Questions:{" "}
        <a href="mailto:harshitwandhare45@gmail.com">harshitwandhare45@gmail.com</a>.
      </p>
    </>
  );
}
