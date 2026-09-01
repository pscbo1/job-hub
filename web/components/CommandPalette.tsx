"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpen,
  Briefcase,
  ClipboardList,
  CornerDownLeft,
  FileText,
  FolderOpen,
  Home,
  LayoutDashboard,
  LogIn,
  MessageSquare,
  Package,
  Search,
  Settings,
  Wand2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

/** Dispatch this event from anywhere (e.g. the nav button) to open the palette. */
export const OPEN_EVENT = "sentinel:command-palette";

type Group = "Navigate" | "Resources";

interface Item {
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  group: Group;
  external?: boolean;
  keywords?: string;
}

const ITEMS: Item[] = [
  { label: "Home", hint: "Landing page", icon: Home, href: "/", group: "Navigate" },
  { label: "Dashboard", hint: "Pipeline, deadlines, activity", icon: LayoutDashboard, href: "/dashboard", group: "Navigate", keywords: "overview funnel stats home" },
  { label: "Collect Jobs", hint: "Collect jobs from Zhaopin, Liepin, Boss", icon: Search, href: "/search", group: "Navigate", keywords: "search collect zhaopin liepin boss mcp-jobs" },
  { label: "Chat", hint: "Ask Sentinel about your jobs", icon: MessageSquare, href: "/chat", group: "Navigate" },
  { label: "Profile", hint: "Your résumé, rendered live", icon: FileText, href: "/profile", group: "Navigate" },
  { label: "Studio", hint: "Tailor + score against a job description", icon: Wand2, href: "/studio", group: "Navigate" },
  { label: "Job Pool", hint: "Discover collected jobs", icon: Briefcase, href: "/jobs", group: "Navigate", keywords: "jobs discover pool" },
  { label: "My Jobs", hint: "Saved, under study, and in-progress jobs", icon: Package, href: "/my-jobs", group: "Navigate", keywords: "saved favorite todo application" },
  { label: "Applications", hint: "Draft through closed — no rejected stage", icon: ClipboardList, href: "/applications", group: "Navigate", keywords: "tracker pipeline applied interview offer closed" },
  { label: "Documents", hint: "Generated résumés & cover letters", icon: FolderOpen, href: "/resumes", group: "Navigate", keywords: "resume cover letter library pdf history" },
  { label: "Settings", hint: "LLM providers, API keys, model config", icon: Settings, href: "/settings", group: "Navigate", keywords: "llm model api key provider openrouter groq gemini ollama" },
  { label: "Sign in", hint: "Account / demo access", icon: LogIn, href: "/login", group: "Navigate", keywords: "login account" },
  {
    label: "GitHub",
    hint: "Star the repo — it keeps the project alive",
    icon: GithubIcon,
    href: "https://github.com/harshitwandhare/job-sentinel",
    group: "Resources",
    external: true,
    keywords: "source star repository",
  },
  {
    label: "Docs",
    hint: "Setup, adapters, architecture",
    icon: BookOpen,
    href: "https://harshitwandhare.github.io/job-sentinel/",
    group: "Resources",
    external: true,
    keywords: "documentation guide help",
  },
  {
    label: "PyPI",
    hint: "pip install job-sentinel",
    icon: Package,
    href: "https://pypi.org/project/job-sentinel/",
    group: "Resources",
    external: true,
    keywords: "install pip package",
  },
];

const GROUP_ORDER: Group[] = ["Navigate", "Resources"];

/**
 * A keyboard-first launcher: ⌘K / Ctrl+K anywhere, type to filter, Enter to
 * go. Closes on Escape, backdrop click, or navigation.
 */
export function CommandPalette() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // Focus after the enter animation has mounted the input.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Flat, filtered list drives keyboard nav; rendering groups it back.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ITEMS;
    return ITEMS.filter((it) =>
      `${it.label} ${it.hint} ${it.keywords ?? ""}`.toLowerCase().includes(q),
    );
  }, [query]);

  // Keep the active row in view as the user arrows through.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function go(item: Item) {
    setOpen(false);
    if (item.external) window.open(item.href, "_blank", "noopener,noreferrer");
    else router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduced ? undefined : { opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[90] flex items-start justify-center bg-night/70 px-4 pt-[14vh] backdrop-blur-sm"
          onMouseDown={() => setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={reduced ? false : { opacity: 0, scale: 0.98, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, scale: 0.98, y: -10 }}
            transition={{ duration: 0.2, ease: [0.21, 0.65, 0.36, 1] }}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_80px_-12px_rgba(12,10,9,0.55)] ring-1 ring-black/5"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Search header */}
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search pages, docs, actions…"
                aria-label="Search pages and actions"
                className="h-14 w-full cursor-text bg-transparent text-[15px] text-ink caret-brand outline-none selection:bg-brand/20 placeholder:text-muted/60"
              />
              <kbd className="hidden rounded-md border border-line bg-bg px-2 py-1 font-mono text-[10px] font-medium text-muted sm:block">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[22rem] overflow-y-auto p-2" role="listbox" aria-label="Results">
              {results.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
                  <Search className="h-5 w-5 text-muted/40" aria-hidden="true" />
                  <p className="text-sm text-muted">
                    No matches for <span className="font-medium text-ink">“{query}”</span>
                  </p>
                </div>
              ) : (
                GROUP_ORDER.map((group) => {
                  const items = results.filter((it) => it.group === group);
                  if (items.length === 0) return null;
                  return (
                    <div key={group} className="mb-1 last:mb-0">
                      <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted/70">
                        {group}
                      </p>
                      <ul>
                        {items.map((it) => {
                          const idx = results.indexOf(it);
                          const isActive = idx === active;
                          return (
                            <li key={it.href} role="option" aria-selected={isActive} data-idx={idx}>
                              <button
                                onClick={() => go(it)}
                                onMouseMove={() => setActive(idx)}
                                className={cn(
                                  "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                                  isActive ? "bg-brand/10" : "hover:bg-ink/[0.03]",
                                )}
                              >
                                <span
                                  className={cn(
                                    "grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-colors",
                                    isActive
                                      ? "border-brand/30 bg-brand/15 text-brand"
                                      : "border-line bg-bg text-muted",
                                  )}
                                >
                                  <it.icon className="h-[18px] w-[18px]" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-1.5">
                                    <span className="text-sm font-medium text-ink">{it.label}</span>
                                    {it.external && (
                                      <span aria-hidden="true" className="text-[11px] text-muted/60">
                                        ↗
                                      </span>
                                    )}
                                  </span>
                                  <span className="block truncate text-xs text-muted">{it.hint}</span>
                                </span>
                                <CornerDownLeft
                                  className={cn(
                                    "h-3.5 w-3.5 shrink-0 text-brand transition-opacity",
                                    isActive ? "opacity-100" : "opacity-0",
                                  )}
                                  aria-hidden="true"
                                />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer hint bar */}
            <div className="flex items-center gap-4 border-t border-line bg-bg/60 px-4 py-2.5 text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <Keycap>↑</Keycap>
                <Keycap>↓</Keycap>
                navigate
              </span>
              <span className="flex items-center gap-1.5">
                <Keycap>↵</Keycap>
                open
              </span>
              <span className="ml-auto flex items-center gap-1.5 font-medium">
                <span aria-hidden="true" className="text-brand">
                  ◈
                </span>
                Job Sentinel
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid h-5 min-w-[1.25rem] place-items-center rounded-md border border-line bg-surface px-1 font-mono text-[10px] font-medium text-muted shadow-sm">
      {children}
    </kbd>
  );
}
