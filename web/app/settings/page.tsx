"use client";

import { useEffect, useState } from "react";

import { LocalSetupGuide } from "@/components/LocalSetupGuide";
import { SentinelLoader } from "@/components/SentinelLoader";
import { Button } from "@/components/ui/button";
import { Card, CardSub, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  getLlmConfig,
  putLlmConfig,
  testLlm,
  type LlmConfig,
  type LlmProviderInfo,
  type LlmTestResult,
} from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Provider model hints ──────────────────────────────────────────────────────

const CHAT_HINTS: Record<string, string> = {
  ollama: "llama3.2:3b",
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
  groq: "llama-3.1-70b-versatile",
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  custom: "your-model-id",
};

const EMBED_HINTS: Record<string, string> = {
  ollama: "nomic-embed-text",
  openrouter: "text-embedding-3-small",
  gemini: "text-embedding-004",
  openai: "text-embedding-3-small",
  custom: "your-embed-model-id",
};

// ── Quick-setup presets ───────────────────────────────────────────────────────

interface Preset {
  label: string;
  provider: string;
  chatModel: string;
  embedModel: string;
  baseUrl: string;
  note?: string;
}

const PRESETS: Preset[] = [
  {
    label: "Ollama (local, default)",
    provider: "ollama",
    chatModel: "llama3.2:3b",
    embedModel: "nomic-embed-text",
    baseUrl: "http://localhost:11434",
  },
  {
    label: "OpenRouter (free)",
    provider: "openrouter",
    chatModel: "meta-llama/llama-3.3-70b-instruct:free",
    embedModel: "",
    baseUrl: "https://openrouter.ai/api/v1",
    note: "Chat only — use a separate embed provider",
  },
  {
    label: "Groq (free + fast)",
    provider: "groq",
    chatModel: "llama-3.1-70b-versatile",
    embedModel: "",
    baseUrl: "https://api.groq.com/openai/v1",
    note: "Chat only — Groq does not support embeddings",
  },
  {
    label: "Gemini (free)",
    provider: "gemini",
    chatModel: "gemini-2.5-flash",
    embedModel: "text-embedding-004",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
];

// ── Styled select (matches Input) ────────────────────────────────────────────


// ── Per-slot form state ───────────────────────────────────────────────────────

interface SlotState {
  provider: string;
  model: string;
  base_url: string;
  api_key: string; // blank = keep existing; non-empty = update
}

function blankSlot(): SlotState {
  return { provider: "ollama", model: "", base_url: "http://localhost:11434", api_key: "" };
}

// ── Test result badge ─────────────────────────────────────────────────────────

function TestBadge({ result }: { result: LlmTestResult | null }) {
  if (!result) return null;
  return (
    <p
      className={cn(
        "mt-2 text-sm",
        result.ok ? "text-emerald-600" : "text-amber-600",
      )}
      role="status"
    >
      {result.ok
        ? `Connected${result.latency_ms !== null ? ` · ${result.latency_ms} ms` : ""}`
        : result.detail}
    </p>
  );
}

// ── Slot editor ───────────────────────────────────────────────────────────────

interface SlotEditorProps {
  title: string;
  subtitle: string;
  target: "chat" | "embed";
  slot: SlotState;
  onChange: (patch: Partial<SlotState>) => void;
  providers: LlmProviderInfo[];
  maskedKey: string;
  testResult: LlmTestResult | null;
  testing: boolean;
  onTest: () => void;
}

function SlotEditor({
  title,
  subtitle,
  target,
  slot,
  onChange,
  providers,
  maskedKey,
  testResult,
  testing,
  onTest,
}: SlotEditorProps) {
  const hints = target === "chat" ? CHAT_HINTS : EMBED_HINTS;
  const modelHint = hints[slot.provider] ?? "model-id";

  const available = providers.filter((p) => target === "chat" || p.supports_embeddings);
  const unavailable = providers.filter((p) => target === "embed" && !p.supports_embeddings);
  const selectedInfo = providers.find((p) => p.id === slot.provider);

  return (
    <Card className="space-y-5">
      <div>
        <CardTitle>{title}</CardTitle>
        <CardSub className="mt-1">{subtitle}</CardSub>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Provider */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted" htmlFor={`${target}-provider`}>
            Provider
          </label>
          <Select
            id={`${target}-provider`}
            value={slot.provider}
            onChange={(e) => {
              const id = e.target.value;
              const info = providers.find((p) => p.id === id);
              onChange({
                provider: id,
                base_url: info?.default_base_url ?? "",
                model: "",
              });
            }}
          >
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            {unavailable.length > 0 && (
              <optgroup label="Not supported for embeddings">
                {unavailable.map((p) => (
                  <option key={p.id} value={p.id} disabled>
                    {p.label} — no embeddings
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
          {target === "embed" && unavailable.length > 0 && (
            <p className="text-xs text-muted">
              Groq and some providers do not expose an embeddings API.
            </p>
          )}
        </div>

        {/* Model */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted" htmlFor={`${target}-model`}>
            Model
          </label>
          <Input
            id={`${target}-model`}
            placeholder={modelHint}
            value={slot.model}
            onChange={(e) => onChange({ model: e.target.value })}
          />
        </div>

        {/* API key */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted" htmlFor={`${target}-apikey`}>
            API key{" "}
            {maskedKey && (
              <span className="font-normal text-emerald-600">· set ({maskedKey})</span>
            )}
          </label>
          <Input
            id={`${target}-apikey`}
            type="password"
            autoComplete="off"
            placeholder={
              maskedKey ? "Leave blank to keep the existing key" : "sk-… or paste your key"
            }
            value={slot.api_key}
            onChange={(e) => onChange({ api_key: e.target.value })}
          />
          {selectedInfo && !selectedInfo.requires_key && (
            <p className="text-xs text-muted">Not required for {selectedInfo.label}.</p>
          )}
        </div>

        {/* Base URL */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted" htmlFor={`${target}-baseurl`}>
            Base URL{" "}
            <span className="font-normal">(advanced — only change for custom endpoints)</span>
          </label>
          <Input
            id={`${target}-baseurl`}
            placeholder={selectedInfo?.default_base_url ?? "https://…"}
            value={slot.base_url}
            onChange={(e) => onChange({ base_url: e.target.value })}
          />
        </div>
      </div>

      {/* Test */}
      <div>
        <Button variant="outline" size="sm" onClick={onTest} disabled={testing}>
          {testing ? "Testing…" : "Test connection"}
        </Button>
        <TestBadge result={testResult} />
      </div>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [loaded, setLoaded] = useState(false);
  const [apiDown, setApiDown] = useState(false);
  const [config, setConfig] = useState<LlmConfig | null>(null);

  const [chatSlot, setChatSlot] = useState<SlotState>(blankSlot());
  const [embedSlot, setEmbedSlot] = useState<SlotState>(blankSlot());

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const [testingChat, setTestingChat] = useState(false);
  const [testingEmbed, setTestingEmbed] = useState(false);
  const [chatTestResult, setChatTestResult] = useState<LlmTestResult | null>(null);
  const [embedTestResult, setEmbedTestResult] = useState<LlmTestResult | null>(null);

  useEffect(() => {
    getLlmConfig().then((c) => {
      if (c === null) {
        setApiDown(true);
      } else {
        applyConfig(c);
      }
      setLoaded(true);
    });
  }, []);

  function applyConfig(c: LlmConfig) {
    setConfig(c);
    setChatSlot({
      provider: c.chat.provider,
      model: c.chat.model,
      base_url: c.chat.base_url,
      api_key: "",
    });
    setEmbedSlot({
      provider: c.embed.provider,
      model: c.embed.model,
      base_url: c.embed.base_url,
      api_key: "",
    });
    setChatTestResult(null);
    setEmbedTestResult(null);
  }

  function applyPreset(preset: Preset, target: "chat" | "embed" | "both") {
    if (target === "chat" || target === "both") {
      const info = config?.providers.find((p) => p.id === preset.provider);
      setChatSlot({
        provider: preset.provider,
        model: preset.chatModel,
        base_url: preset.baseUrl || info?.default_base_url || "",
        api_key: "",
      });
    }
    if (target === "embed" || target === "both") {
      const info = config?.providers.find((p) => p.id === preset.provider);
      if (info?.supports_embeddings && preset.embedModel) {
        setEmbedSlot({
          provider: preset.provider,
          model: preset.embedModel,
          base_url: preset.baseUrl || info?.default_base_url || "",
          api_key: "",
        });
      }
    }
    setSaveStatus(null);
  }

  async function onSave() {
    setSaving(true);
    setSaveStatus(null);

    const body = {
      chat: {
        provider: chatSlot.provider,
        model: chatSlot.model,
        base_url: chatSlot.base_url,
        ...(chatSlot.api_key !== "" ? { api_key: chatSlot.api_key } : {}),
      },
      embed: {
        provider: embedSlot.provider,
        model: embedSlot.model,
        base_url: embedSlot.base_url,
        ...(embedSlot.api_key !== "" ? { api_key: embedSlot.api_key } : {}),
      },
    };

    const updated = await putLlmConfig(body);
    setSaving(false);

    if (updated) {
      applyConfig(updated);
      setSaveStatus({ ok: true, msg: "Saved." });
      setTimeout(() => setSaveStatus(null), 3000);
    } else {
      setSaveStatus({ ok: false, msg: "Save failed — is `job-sentinel serve` running?" });
    }
  }

  function onCancel() {
    if (config) applyConfig(config);
    setSaveStatus(null);
  }

  async function onTestChat() {
    setTestingChat(true);
    setChatTestResult(null);
    const r = await testLlm("chat");
    setChatTestResult(r);
    setTestingChat(false);
  }

  async function onTestEmbed() {
    setTestingEmbed(true);
    setEmbedTestResult(null);
    const r = await testLlm("embed");
    setEmbedTestResult(r);
    setTestingEmbed(false);
  }

  if (!loaded) return <SentinelLoader label="Loading settings" />;

  if (apiDown) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <LocalSetupGuide context="The LLM settings page" />
      </div>
    );
  }

  const providers = config?.providers ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-5 py-12">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-muted">
          Configure AI providers for chat and embeddings. Ollama is the zero-config default —
          no key needed, everything runs locally. Swap in an external provider whenever you
          want a larger or faster model.
        </p>
      </header>

      {/* Quick-setup presets */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">Quick setup</h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.provider}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset(preset, "both")}
              title={preset.note}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Presets only fill the form fields below — nothing is saved until you click Save.
        </p>
      </section>

      {/* Privacy note */}
      <div className="rounded-xl border border-line bg-bg px-4 py-3 text-sm text-muted">
        <strong className="font-medium text-ink">Your keys stay local.</strong> API keys are
        written to your <code className="font-mono text-xs">.env</code> on your machine and sent
        only to the provider you choose. They are never logged, never transmitted to any
        third-party service, and masked after saving so they cannot be read back from the UI.
      </div>

      {/* Chat slot */}
      <SlotEditor
        title="Chat & tailoring model"
        subtitle="Used for resume rephrasing, tailoring, cover letters, and the chat assistant."
        target="chat"
        slot={chatSlot}
        onChange={(patch) => setChatSlot((s) => ({ ...s, ...patch }))}
        providers={providers}
        maskedKey={config?.chat.api_key_masked ?? ""}
        testResult={chatTestResult}
        testing={testingChat}
        onTest={onTestChat}
      />

      {/* Embed slot */}
      <SlotEditor
        title="Embeddings model"
        subtitle="Used for semantic job search and resume similarity scoring. Groq does not support embeddings."
        target="embed"
        slot={embedSlot}
        onChange={(patch) => setEmbedSlot((s) => ({ ...s, ...patch }))}
        providers={providers}
        maskedKey={config?.embed.api_key_masked ?? ""}
        testResult={embedTestResult}
        testing={testingEmbed}
        onTest={onTestEmbed}
      />

      {/* Save / cancel */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        {saveStatus && (
          <p
            className={cn(
              "text-sm",
              saveStatus.ok ? "text-emerald-600" : "text-amber-600",
            )}
            role="status"
          >
            {saveStatus.msg}
          </p>
        )}
      </div>
    </div>
  );
}
