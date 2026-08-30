"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SearchPreset } from "@/lib/searchCapabilities";
import { cn } from "@/lib/utils";

export function SearchPresetsBar({
  presets,
  activeId,
  dirty,
  canSave,
  onLoad,
  onSave,
  onUpdate,
  onRename,
  onDelete,
}: {
  presets: SearchPreset[];
  activeId: string | null;
  dirty: boolean;
  canSave: boolean;
  onLoad: (preset: SearchPreset) => void;
  onSave: (name: string) => void;
  onUpdate: () => void;
  onRename: (preset: SearchPreset, name: string) => void;
  onDelete: (preset: SearchPreset) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const active = presets.find((p) => p.id === activeId) ?? null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">Saved searches</p>
        {saving ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = name.trim();
              if (!trimmed) return;
              onSave(trimmed);
              setName("");
              setSaving(false);
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Preset name"
              className="h-8 w-40"
              autoFocus
              aria-label="Preset name"
            />
            <Button type="submit" size="sm" disabled={!name.trim() || !canSave}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSaving(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setSaving(true)} disabled={!canSave}>
            Save current
          </Button>
        )}
      </div>
      {presets.length === 0 && (
        <p className="text-[11px] text-muted">Save this search to reuse the same sources and filters later.</p>
      )}
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onLoad(preset)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                preset.id === activeId
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-line text-muted hover:text-ink",
              )}
            >
              {preset.name}
            </button>
          ))}
        </div>
      )}
      {active && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {dirty && (
            <button type="button" className="font-medium text-brand hover:underline" onClick={onUpdate}>
              Update
            </button>
          )}
          {renamingId === active.id ? (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = renameValue.trim();
                if (!trimmed) return;
                onRename(active, trimmed);
                setRenamingId(null);
              }}
            >
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="h-7 w-36"
                autoFocus
                aria-label="Rename preset"
              />
              <Button type="submit" size="sm" disabled={!renameValue.trim()}>
                Rename
              </Button>
            </form>
          ) : (
            <button
              type="button"
              className="text-muted hover:text-ink hover:underline"
              onClick={() => {
                setRenamingId(active.id);
                setRenameValue(active.name);
              }}
            >
              Rename
            </button>
          )}
          <button
            type="button"
            className="text-muted hover:text-ink hover:underline"
            onClick={() => onDelete(active)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
