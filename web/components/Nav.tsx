"use client";

import { ChevronDown, Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { OPEN_EVENT } from "@/components/CommandPalette";
import { getAuthStatus, type AuthStatus } from "@/lib/api";
import { jobsPath, marketFromPath, myJobsPath, searchPath, type MarketId } from "@/lib/markets";
import { readLastMarket } from "@/lib/marketPrefs";
import { cn } from "@/lib/utils";

const PRIMARY = [
  { href: "/search", label: "Collect Jobs", page: "search" as const },
  { href: "/jobs", label: "Discover", page: "jobs" as const },
  { href: "/my-jobs", label: "My Jobs", page: "my-jobs" as const },
  { href: "/applications", label: "Applications" },
];

const SECONDARY = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/studio", label: "Studio" },
  { href: "/profile", label: "Profile" },
  { href: "/chat", label: "Chat" },
  { href: "/interview", label: "Interview Prep" },
  { href: "/settings", label: "Settings" },
];

const REPO = "https://github.com/harshitwandhare/job-sentinel";
const NAV_HEIGHT = 56;

/**
 * True while a `[data-nav-theme="dark"]` section sits under the nav bar, so
 * the mobile bar can flip to light text over dark backgrounds (profile desk).
 */
function useOverDarkSection(pathname: string): boolean {
  const [overDark, setOverDark] = useState(false);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      let dark = false;
      document.querySelectorAll<HTMLElement>("[data-nav-theme='dark']").forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top <= NAV_HEIGHT && rect.bottom >= NAV_HEIGHT / 2) dark = true;
      });
      setOverDark(dark);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pathname]);

  return overDark;
}

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

export function Nav() {
  const pathname = usePathname();
  const dark = useOverDarkSection(pathname);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const [lastMarket, setLastMarket] = useState<MarketId>("cn");

  useEffect(() => {
    getAuthStatus().then(setAuth);
    setOpen(false);
    setMore(false);
    setLastMarket(marketFromPath(pathname) ?? readLastMarket());
  }, [pathname]);

  useEffect(() => {
    if (!more) return;
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMore(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [more]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const market = lastMarket;
  function itemHref(l: (typeof PRIMARY)[number]): string {
    if (l.page === "search") return searchPath(market);
    if (l.page === "jobs") return jobsPath(market);
    if (l.page === "my-jobs") return myJobsPath(market);
    return l.href;
  }
  function itemActive(l: (typeof PRIMARY)[number]): boolean {
    if (l.page === "jobs") return /\/jobs(?:\/|$)/.test(pathname) && !pathname.includes("my-jobs");
    if (l.page === "my-jobs") return /\/my-jobs(?:\/|$)/.test(pathname);
    if (l.page === "search") return /\/search(?:\/|$)/.test(pathname);
    return isActive(l.href);
  }
  const accountLabel = auth?.user ? auth.user.username : "Sign in";
  const moreActive = SECONDARY.some((l) => isActive(l.href)) || isActive("/login");

  const sideLink = (href: string) =>
    cn(
      "block rounded-md px-2.5 py-1.5 text-sm transition-colors",
      isActive(href)
        ? "bg-ink/[0.06] font-medium text-ink"
        : "text-muted hover:text-ink",
    );

  const mobileLink = (href: string) =>
    cn(
      "block rounded-lg px-3 py-2.5 text-sm transition-colors",
      isActive(href)
        ? dark
          ? "bg-white/10 font-semibold text-white"
          : "bg-surface font-semibold text-ink"
        : dark
          ? "text-stone-300 hover:bg-white/10 hover:text-white"
          : "text-muted hover:bg-surface hover:text-ink",
    );

  const iconBtnCls = cn(
    "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
    dark
      ? "border-white/15 text-stone-300 hover:bg-white/10 hover:text-white"
      : "border-line text-muted hover:border-ink/30 hover:text-ink",
  );

  const moreMenu = (
    <div
      role="menu"
      className="w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lift"
    >
      {SECONDARY.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          role="menuitem"
          className={cn(
            "block px-3 py-2 text-sm transition-colors",
            isActive(l.href)
              ? "bg-brand/10 font-medium text-ink"
              : "text-muted hover:bg-ink/[0.04] hover:text-ink",
          )}
        >
          {l.label}
        </Link>
      ))}
      <div className="my-1 border-t border-line" />
      <Link
        href="/login"
        role="menuitem"
        className="block px-3 py-2 text-sm text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink"
      >
        {accountLabel}
      </Link>
      <a
        href={REPO}
        target="_blank"
        rel="noopener noreferrer"
        role="menuitem"
        className="flex items-center gap-2 px-3 py-2 text-sm text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink"
      >
        GitHub ↗
      </a>
    </div>
  );

  return (
    <>
      {/* Desktop: persistent left workflow nav */}
      <aside
        aria-label="Main"
        className="sticky top-0 z-40 hidden h-dvh w-44 shrink-0 flex-col border-r border-line/80 bg-bg/90 px-3 py-4 backdrop-blur-md md:flex"
      >
        <Link href="/" className="mb-5 flex items-center gap-2 px-1 font-semibold tracking-tight text-ink">
          <img
            src="/brand/sentinel.png"
            alt=""
            className="h-8 w-8 rounded-lg border border-white/10 bg-night object-cover shadow-sm"
            aria-hidden="true"
          />
          <span className="text-sm">Job Hub</span>
        </Link>

        <ul className="space-y-0.5">
          {PRIMARY.map((l) => {
            const href = itemHref(l);
            return (
            <li key={l.href}>
              <Link
                href={href}
                aria-current={itemActive(l) ? "page" : undefined}
                className={cn(
                  "block rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  itemActive(l)
                    ? "bg-ink/[0.06] font-medium text-ink"
                    : "text-muted hover:text-ink",
                )}
              >
                {l.label}
              </Link>
            </li>
            );
          })}
        </ul>

        <div className="mt-auto space-y-2">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT))}
            aria-label="Search and jump to…  (Ctrl or Cmd + K)"
            title="Search & jump to (⌘K)"
            className="flex w-full items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-ink/30 hover:text-ink"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Jump to</span>
            <kbd className="rounded border border-line px-1 font-mono text-[10px] leading-4">⌘K</kbd>
          </button>

          <div ref={moreRef} className="relative">
            <button
              type="button"
              onClick={() => setMore((v) => !v)}
              aria-expanded={more}
              aria-haspopup="menu"
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors",
                moreActive || more
                  ? "bg-ink/[0.06] font-medium text-ink"
                  : "text-muted hover:text-ink",
              )}
            >
              More
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", more && "rotate-180")} />
            </button>
            {more && <div className="absolute bottom-full left-0 z-50 mb-1.5">{moreMenu}</div>}
          </div>
        </div>
      </aside>

      {/* Mobile / narrow: compact top bar + hamburger */}
      <header
        className={cn(
          "sticky top-0 z-50 border-b backdrop-blur-md transition-colors duration-300 md:hidden",
          dark ? "border-white/10 bg-night/70" : "border-line/80 bg-bg/80",
        )}
      >
        <nav aria-label="Main" className="flex h-14 items-center justify-between gap-3 px-4">
          <Link
            href="/"
            className={cn(
              "flex shrink-0 items-center gap-2 font-semibold tracking-tight",
              dark ? "text-white" : "text-ink",
            )}
          >
            <img
              src="/brand/sentinel.png"
              alt=""
              className="h-8 w-8 rounded-lg border border-white/10 bg-night object-cover shadow-sm"
              aria-hidden="true"
            />
            <span>Job Hub</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className={iconBtnCls}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {open && (
          <div
            id="mobile-menu"
            className={cn(
              "border-t",
              dark ? "border-white/10 bg-night/95" : "border-line bg-bg/95",
            )}
          >
            <div className="space-y-1 px-3 py-3">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm",
                  dark ? "text-stone-300 hover:bg-white/10" : "text-muted hover:bg-surface",
                )}
              >
                <Search className="h-4 w-4" /> Jump to…
              </button>
              {PRIMARY.map((l) => {
                const href = itemHref(l);
                return (
                <Link
                  key={l.href}
                  href={href}
                  aria-current={itemActive(l) ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-3 py-2.5 text-sm transition-colors",
                    itemActive(l)
                      ? dark
                        ? "bg-white/10 font-semibold text-white"
                        : "bg-surface font-semibold text-ink"
                      : dark
                        ? "text-stone-300 hover:bg-white/10 hover:text-white"
                        : "text-muted hover:bg-surface hover:text-ink",
                  )}
                >
                  {l.label}
                </Link>
                );
              })}
              <div className={cn("my-2 border-t", dark ? "border-white/10" : "border-line")} />
              {[...SECONDARY, { href: "/login", label: accountLabel }].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={isActive(l.href) ? "page" : undefined}
                  className={mobileLink(l.href)}
                >
                  {l.label}
                </Link>
              ))}
              <a
                href={REPO}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "block rounded-lg px-3 py-2.5 text-sm transition-colors",
                  dark ? "text-stone-300 hover:bg-white/10" : "text-muted hover:bg-surface",
                )}
              >
                GitHub ↗
              </a>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
