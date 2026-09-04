import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Job Hub is local-first: the self-hosted app keeps your data on your machine, and the hosted demo collects no personal data.",
};

export default function PrivacyPolicy() {
  return (
    <>
      <h2 className="!mt-0">Privacy Policy</h2>
      <p className="text-sm text-muted">Effective: 14 June 2026</p>

      <p>
        Job Hub (&ldquo;the Project&rdquo;, &ldquo;we&rdquo;) is an open-source, local-first
        application (MIT fork of Job Sentinel by Harshit Wandhare). This policy explains what data is — and isn&rsquo;t
        — handled, across the two ways you can use Job Hub.
      </p>

      <h2>1. The self-hosted app (the product)</h2>
      <p>
        When you run Job Hub on your own machine, <strong>we operate no servers and receive
        none of your data.</strong> Your profile, tracked jobs, applications, generated résumés,
        portal credentials, and any local AI model all live in local files (e.g. a SQLite database
        and a <code>.env</code> file) on your hardware. We cannot see them, and nothing is
        transmitted to us — there is no &ldquo;us&rdquo; in the data path.
      </p>
      <p>
        Data leaves your machine only when <strong>you</strong> direct it to:
      </p>
      <ul>
        <li>
          <strong>Job sources you enable</strong> (e.g. RemoteOK, Adzuna) receive your search
          queries to return listings, under their own privacy policies.
        </li>
        <li>
          <strong>An LLM provider you configure</strong> (OpenAI, OpenRouter, Groq, Gemini, …)
          receives the prompts you send for résumé tailoring or matching, under that provider&rsquo;s
          policy. If you use the default local model (Ollama), even that stays on your machine.
        </li>
        <li>
          <strong>Notification channels you set up</strong> (Telegram, email) receive the alerts you
          ask them to deliver.
        </li>
      </ul>
      <p>
        We never fine-tune any model on your data — personalization is retrieval over your own local
        files, so your data is never baked into model weights and remains deletable.
      </p>

      <h2>2. The hosted demo</h2>
      <p>
        The hosted demo at <a href="https://job-sentinel.vercel.app">job-sentinel.vercel.app</a> exists
        only to show the interface. It runs on a <strong>bundled, fictional sample dataset</strong>:
      </p>
      <ul>
        <li>No sign-up, no accounts, no login — we collect no personal information.</li>
        <li>No analytics or advertising/tracking cookies are set by us.</li>
        <li>
          Your browser&rsquo;s <code>localStorage</code> may hold UI state (for example, text you type
          into the demo chat) on <em>your</em> device; it is never sent to us and you can clear it any
          time.
        </li>
        <li>
          As with any website, our host (Vercel) processes standard technical request data such as
          IP address and user agent to serve the page. See the{" "}
          <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">
            Vercel Privacy Policy
          </a>
          .
        </li>
      </ul>

      <h2>3. What we don&rsquo;t do</h2>
      <ul>
        <li>No telemetry or usage tracking in the app.</li>
        <li>No selling or sharing of personal data — there is none to sell.</li>
        <li>No advertising networks or third-party trackers.</li>
      </ul>

      <h2>4. Your rights (GDPR / CCPA and similar)</h2>
      <p>
        Because you hold your data locally, the rights to access, export, correct, and erase are
        immediate and self-service: every entity (profile, applications, documents, jobs) has a
        delete action in the app, and you can export or remove the underlying files directly. We do
        not hold copies, so there is nothing for us to action on your behalf. We do not sell personal
        information.
      </p>

      <h2>5. Children</h2>
      <p>
        Job Hub is not directed to children under 16 and we do not knowingly collect their data.
      </p>

      <h2>6. Changes &amp; contact</h2>
      <p>
        We&rsquo;ll update this page if the project&rsquo;s data practices change (for example, if a
        future optional hosted tier is introduced). Questions:{" "}
        <a href="mailto:harshitwandhare45@gmail.com">harshitwandhare45@gmail.com</a>.
      </p>
    </>
  );
}
