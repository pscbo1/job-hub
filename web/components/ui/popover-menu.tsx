"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * Portal popover used for toolbar and row overflow menus.
 * Fixed positioning so table overflow cannot clip the panel.
 */
export function PopoverMenu({
  align = "start",
  ariaLabel,
  title,
  minWidth = 192,
  role = "menu",
  triggerClassName,
  trigger,
  children,
}: {
  align?: "start" | "end";
  ariaLabel: string;
  title?: string;
  minWidth?: number;
  role?: "menu" | "dialog";
  triggerClassName?: string;
  trigger: ReactNode;
  children: ReactNode | ((api: { close: () => void }) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, minWidth });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  function place() {
    const triggerEl = triggerRef.current;
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const width = Math.max(minWidth, rect.width);
    const left =
      align === "end"
        ? Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)
        : Math.min(rect.left, window.innerWidth - width - 8);
    const panelEst = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < panelEst && rect.top > panelEst ? rect.top - panelEst - 4 : rect.bottom + 4;
    setPos({ top, left: Math.max(8, left), minWidth: width });
  }

  function close() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    place();
    const onOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        triggerRef.current?.focus();
      }
    };
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onResize = () => place();
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, align, minWidth]);

  const body = typeof children === "function" ? children({ close }) : children;

  const panel = (
    <div
      ref={panelRef}
      id={panelId}
      role={role}
      aria-label={ariaLabel}
      tabIndex={-1}
      style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.minWidth, zIndex: 9999 }}
      className="max-h-[min(24rem,calc(100vh-2rem))] overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-xl ring-1 ring-ink/5 outline-none"
    >
      {body}
    </div>
  );

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        title={title ?? ariaLabel}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup={role === "menu" ? "menu" : "dialog"}
        aria-controls={panelId}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (open) close();
          else {
            place();
            setOpen(true);
          }
        }}
        className={cn(triggerClassName)}
      >
        {trigger}
      </button>
      {mounted && open ? createPortal(panel, document.body) : null}
    </div>
  );
}

export function PopoverMenuItem({
  children,
  onClick,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex w-full px-3 py-2 text-left text-sm text-ink hover:bg-bg",
        danger && "hover:text-red-600",
      )}
    >
      {children}
    </button>
  );
}
