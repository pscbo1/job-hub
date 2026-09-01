/** Product-cut Command Palette destinations (no Studio / Profile / Documents). */

export const COMMAND_PALETTE_NAV: { label: string; href: string; hint: string; keywords?: string }[] =
  [
    { label: "Home", hint: "Landing page", href: "/" },
    {
      label: "Dashboard",
      hint: "Pipeline, deadlines, activity",
      href: "/dashboard",
      keywords: "overview funnel stats home",
    },
    {
      label: "Collect Jobs",
      hint: "Collect jobs from Zhaopin, Liepin, Boss",
      href: "/search",
      keywords: "search collect zhaopin liepin boss mcp-jobs",
    },
    { label: "Chat", hint: "Ask Sentinel about your jobs", href: "/chat" },
    {
      label: "Discover",
      hint: "Job pool — save, reference, start application",
      href: "/jobs",
      keywords: "jobs discover pool",
    },
    {
      label: "Tasks",
      hint: "Next steps, deadlines, drafts",
      href: "/tasks",
      keywords: "tasks next step deadline draft",
    },
    {
      label: "Applications",
      hint: "Draft through closed — no rejected stage",
      href: "/applications",
      keywords: "tracker pipeline applied interview offer closed",
    },
    {
      label: "Settings",
      hint: "LLM providers, API keys, model config",
      href: "/settings",
      keywords: "llm model api key provider openrouter groq gemini ollama",
    },
    { label: "Sign in", hint: "Account / demo access", href: "/login", keywords: "login account" },
  ];
