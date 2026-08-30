"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";

import {
  dismissHubJob,
  getFilterSettings,
  saveFilterSettings,
  undismissHubJob,
  type FilterSettings,
  type HubJob,
} from "@/lib/api";
import { clampMenuPosition, companyAlreadyListed } from "@/lib/jobPoolMenu";

export type CardMenu = { job: HubJob; x: number; y: number };
export type PoolToast =
  | { kind: "dismiss"; jobId: string; message: string }
  | { kind: "hide-company"; previous: FilterSettings; message: string };

export function useJobPoolActions() {
  const router = useRouter();
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [hiddenCompanies, setHiddenCompanies] = useState<string[]>([]);
  const [menu, setMenu] = useState<CardMenu | null>(null);
  const [toast, setToast] = useState<PoolToast | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(id);
  }, [toast]);

  function openMenu(job: HubJob, clientX: number, clientY: number) {
    setMenu({
      job,
      ...clampMenuPosition(clientX, clientY, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    });
  }

  function isHidden(job: HubJob): boolean {
    if (hiddenIds.includes(job.id)) return true;
    const company = job.company.trim().toLowerCase();
    return hiddenCompanies.some((name) => name.trim().toLowerCase() === company);
  }

  async function dismiss(job: HubJob) {
    if (busy) return;
    setMenu(null);
    setBusy(true);
    setHiddenIds((ids) => (ids.includes(job.id) ? ids : [...ids, job.id]));
    const saved = await dismissHubJob(job.id);
    setBusy(false);
    if (!saved) {
      setHiddenIds((ids) => ids.filter((id) => id !== job.id));
      return;
    }
    setToast({ kind: "dismiss", jobId: job.id, message: `Dismissed ${job.title || "job"}` });
    router.refresh();
  }

  async function hideCompany(job: HubJob) {
    const company = job.company.trim();
    if (!company || busy) return;
    setMenu(null);
    setBusy(true);
    const current = await getFilterSettings();
    if (!current) {
      setBusy(false);
      return;
    }
    const excluded = companyAlreadyListed(current.excluded_companies, company)
      ? current.excluded_companies
      : [...current.excluded_companies, company];
    setHiddenCompanies((list) => (list.includes(company) ? list : [...list, company]));
    const saved = await saveFilterSettings({
      ...current,
      excluded_companies: excluded,
      apply: true,
    });
    setBusy(false);
    if (!saved) {
      setHiddenCompanies((list) => list.filter((name) => name !== company));
      return;
    }
    setToast({ kind: "hide-company", previous: current, message: `Hidden ${company}` });
    router.refresh();
  }

  async function undo() {
    if (!toast || busy) return;
    const current = toast;
    setBusy(true);
    if (current.kind === "dismiss") {
      const restored = await undismissHubJob(current.jobId);
      if (restored) {
        setHiddenIds((ids) => ids.filter((id) => id !== current.jobId));
        setToast(null);
        router.refresh();
      }
    } else {
      const saved = await saveFilterSettings({ ...current.previous, apply: true });
      if (saved) {
        setHiddenCompanies(current.previous.excluded_companies);
        setToast(null);
        router.refresh();
      }
    }
    setBusy(false);
  }

  return {
    hiddenIds,
    hiddenCompanies,
    menu,
    toast,
    busy,
    setMenu,
    openMenu,
    isHidden,
    dismiss,
    hideCompany,
    undo,
  };
}

export function JobPoolActionMenu({
  menu,
  busy,
  menuRef,
  onDismiss,
  onHideCompany,
}: {
  menu: CardMenu;
  busy: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  onDismiss: (job: HubJob) => void;
  onHideCompany: (job: HubJob) => void;
}) {
  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lift"
      style={{ left: menu.x, top: menu.y }}
    >
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        onClick={() => onDismiss(menu.job)}
        className="block w-full px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-ink/[0.04] disabled:opacity-50"
      >
        Dismiss job
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={busy || !menu.job.company.trim()}
        onClick={() => onHideCompany(menu.job)}
        className="block w-full px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-ink/[0.04] disabled:opacity-50"
      >
        Hide this company
      </button>
    </div>
  );
}

export function JobPoolUndoToast({
  message,
  busy,
  onUndo,
}: {
  message: string;
  busy: boolean;
  onUndo: () => void;
}) {
  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-ink px-4 py-2.5 text-sm text-white shadow-lift"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onUndo}
        disabled={busy}
        className="rounded-md bg-white/15 px-2 py-1 text-xs font-medium hover:bg-white/25 disabled:opacity-50"
      >
        Undo
      </button>
    </div>
  );
}

export function useDismissOutside(open: boolean, onClose: () => void) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return menuRef;
}
