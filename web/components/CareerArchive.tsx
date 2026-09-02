"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ProfileEditor } from "@/components/ProfileEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createProfileVersion,
  getMaterials,
  getProfile,
  getProfileVersions,
  materialVersionFileUrl,
  profileVersionFileUrl,
  putProfile,
  type Material,
  type Profile,
  type ProfileVersion,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type Tab = "overview" | "profile" | "resumes";

const EMPTY_PROFILE: Profile = {
  basics: { name: "", headline: "", email: "", phone: "", location: "", links: [], summary: "" },
  education: [], experience: [], projects: [], skills: [], certifications: [], awards: [], publications: [],
};

function tabFromUrl(): Tab {
  if (typeof window === "undefined") return "overview";
  const value = new URLSearchParams(window.location.search).get("tab");
  return value === "profile" || value === "resumes" ? value : "overview";
}

const resumeMaterials = (materials: Material[]) => materials.filter((item) => item.kind === "resume" || item.kind === "portfolio");

export function CareerArchive() {
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  function select(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState({}, "", url);
  }
  return (
    <div className="mx-auto max-w-6xl space-y-7 px-5 py-9">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div><p className="text-sm font-medium text-brand">Career Archive</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">Your career, kept ready.</h1><p className="mt-2 max-w-2xl text-sm text-muted">Keep one canonical profile and the resume versions you use for different roles.</p></div>
        <div className="flex gap-2" role="tablist" aria-label="Career archive sections">
          {(["overview", "profile", "resumes"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => select(item)} className={cn("border-b-2 px-3 py-2 text-sm font-medium", tab === item ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink")}>{item === "overview" ? "Overview" : item === "profile" ? "Master profile" : "Resume archive"}</button>)}
        </div>
      </header>
      {tab === "overview" ? <ArchiveOverview onNavigate={select} /> : tab === "profile" ? <ArchiveProfile /> : <ResumeArchive />}
    </div>
  );
}

function ArchiveOverview({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [versions, setVersions] = useState<ProfileVersion[]>([]);
  const [busy, setBusy] = useState(true);
  useEffect(() => { void Promise.all([getMaterials(), getProfile(), getProfileVersions()]).then(([nextMaterials, nextProfile, nextVersions]) => { setMaterials(nextMaterials); setProfile(nextProfile); setVersions(nextVersions); setBusy(false); }); }, []);
  const resumes = useMemo(() => resumeMaterials(materials), [materials]);
  if (busy) return <p className="text-sm text-muted">Loading archive…</p>;
  const profileName = profile?.basics.name || "Profile not started";
  const latestResume = [...resumes].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  return <div className="space-y-6"><section className="grid gap-3 sm:grid-cols-3"><Stat label="Master profile" value={profileName} detail={profile?.basics.headline || "Add your basics and experience"} /><Stat label="Profile snapshots" value={String(versions.length)} detail={versions.length ? `Latest v${versions[0].version_number}` : "Create one when ready to apply"} /><Stat label="Resume records" value={String(resumes.length)} detail={latestResume?.title || "Add a tailored resume"} /></section><section className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]"><div className="rounded-lg border border-line bg-surface p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-ink">Keep your source of truth current</h2><p className="mt-1 text-sm text-muted">The master profile is reusable context. Snapshots preserve the exact profile used for an application.</p></div><Button size="sm" onClick={() => onNavigate("profile")}>Edit profile</Button></div><div className="mt-5 border-t border-line pt-4 text-sm text-muted">{profile?.basics.summary ? <p className="line-clamp-3 text-ink">{profile.basics.summary}</p> : <p>Your profile is empty. Start with a headline, summary, and recent experience.</p>}</div></div><div className="rounded-lg border border-line bg-surface p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-ink">Recent resume records</h2><p className="mt-1 text-sm text-muted">Organized by direction and language.</p></div><Button variant="outline" size="sm" onClick={() => onNavigate("resumes")}>View archive</Button></div><div className="mt-4 space-y-3">{resumes.slice(0, 3).map((material) => <ResumeRow key={material.id} material={material} compact />)}{resumes.length === 0 ? <p className="border-t border-line pt-4 text-sm text-muted">No resume records yet.</p> : null}</div></div></section></div>;
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-lg border border-line bg-surface p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p><p className="mt-2 truncate text-lg font-semibold text-ink">{value}</p><p className="mt-1 truncate text-sm text-muted">{detail}</p></div>; }

function ResumeArchive() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [busy, setBusy] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const refresh = useCallback(async () => { setBusy(true); setMaterials(resumeMaterials(await getMaterials())); setBusy(false); }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const grouped = useMemo(() => { const result = new Map<string, Material[]>(); for (const item of materials) { const key = item.direction?.trim() || "General"; result.set(key, [...(result.get(key) || []), item]); } return [...result.entries()].sort(([a], [b]) => a.localeCompare(b)); }, [materials]);
  if (busy) return <p className="text-sm text-muted">Loading resume archive…</p>;
  return <div className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold text-ink">Resume archive</h2><p className="mt-1 text-sm text-muted">Each record can hold multiple dated versions. Choose the right one when building an application packet.</p></div><Button onClick={() => void refresh()} variant="outline" size="sm">Refresh</Button></div>{grouped.length === 0 ? <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">No resume records yet. Add a resume from Materials, then return here to organize it.</div> : grouped.map(([direction, items]) => <section key={direction} className="space-y-3"><div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-ink">{direction}</h3><span className="text-xs text-muted">{items.length} {items.length === 1 ? "record" : "records"}</span></div><div className="divide-y divide-line rounded-lg border border-line bg-surface">{items.map((material) => <div key={material.id} className="p-4"><button type="button" className="w-full text-left" onClick={() => setExpanded(expanded === material.id ? null : material.id)} aria-expanded={expanded === material.id}><ResumeRow material={material} /></button>{expanded === material.id ? <VersionList material={material} /> : null}</div>)}</div></section>)}</div>;
}

function ResumeRow({ material, compact = false }: { material: Material; compact?: boolean }) { const latest = material.versions[material.versions.length - 1]; return <div className="flex items-center justify-between gap-4"><div className="min-w-0"><p className="truncate text-sm font-medium text-ink">{material.title}</p><p className="mt-1 truncate text-xs text-muted">{material.direction || "General"} · {material.language === "zh" ? "中文" : material.language === "en" ? "English" : "Language unset"}</p></div><div className="shrink-0 text-right"><p className="text-xs font-medium text-ink">{latest ? `v${latest.version_number}` : "No version"}</p>{!compact && latest ? <p className="mt-1 text-xs text-muted">{latest.version_date || material.updated_at.slice(0, 10)}</p> : null}</div></div>; }

function VersionList({ material }: { material: Material }) { return <div className="mt-4 border-t border-line pt-3"><p className="text-xs font-medium uppercase tracking-wide text-muted">Version history</p><ol className="mt-2 space-y-2">{material.versions.map((version) => <li key={version.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-ink">v{version.version_number} {version.version_label || "Untitled"}</span><span className="text-xs text-muted">{version.version_date || "Undated"} · <a className="text-brand hover:underline" href={materialVersionFileUrl(version.id)}>Download</a></span></li>)}</ol></div>; }

function ArchiveProfile() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [draft, setDraft] = useState<Profile>(EMPTY_PROFILE);
  const [versions, setVersions] = useState<ProfileVersion[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => { setBusy(true); const [current, history] = await Promise.all([getProfile(), getProfileVersions()]); const next = current ?? EMPTY_PROFILE; setProfile(next); setDraft(structuredClone(next)); setVersions(history); setBusy(false); }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const isDirty = JSON.stringify(profile) !== JSON.stringify(draft);
  async function saveProfile() { setSaving(true); const saved = await putProfile(draft); if (!saved) setNotice("Save failed. Check that the local API is running."); else { setProfile(saved); setDraft(structuredClone(saved)); setNotice("Profile saved."); } setSaving(false); }
  async function saveSnapshot() { setSaving(true); if (isDirty) { const saved = await putProfile(draft); if (!saved) { setNotice("Save failed. Check that the local API is running."); setSaving(false); return; } setProfile(saved); setDraft(structuredClone(saved)); } const snapshot = await createProfileVersion({ version_label: label, notes }); setLabel(""); setNotes(""); setVersions(await getProfileVersions()); setNotice(snapshot.version ? "Snapshot created." : "Snapshot could not be created."); setSaving(false); }
  if (busy) return <p className="text-sm text-muted">Loading master profile…</p>;
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"><section className="space-y-5 rounded-lg border border-line bg-surface p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-ink">Master profile</h2><p className="mt-1 text-sm text-muted">One canonical profile shared across applications and resume versions.</p></div><a href="/profile" className="text-sm text-brand hover:underline">Open full editor</a></div><ProfileEditor draft={draft} setDraft={setDraft} /><div className="space-y-3 border-t border-line pt-4"><div className="flex flex-wrap gap-3"><Button onClick={() => void saveProfile()} disabled={saving || !isDirty}>{saving ? "Saving…" : "Save changes"}</Button><Button variant="outline" onClick={() => void saveSnapshot()} disabled={saving}>{saving ? "Working…" : "Create snapshot"}</Button></div><div className="grid gap-3 sm:grid-cols-2"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Snapshot label (optional)" /><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" /></div>{notice ? <p className="text-sm text-muted">{notice}</p> : null}</div></section><aside className="rounded-lg border border-line bg-surface p-5"><h2 className="text-lg font-semibold text-ink">Profile snapshots</h2><p className="mt-1 text-sm text-muted">Immutable versions you can attach to an application.</p><ol className="mt-4 space-y-3">{versions.map((version) => <li key={version.id} className="border-t border-line pt-3 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium text-ink">v{version.version_number} {version.version_label || "Untitled"}</span><span className="text-xs text-muted">{version.version_date}</span></div>{version.notes ? <p className="mt-1 text-xs text-muted">{version.notes}</p> : null}<a className="mt-1 inline-block text-xs text-brand hover:underline" href={profileVersionFileUrl(version.id)}>Download JSON</a></li>)}{versions.length === 0 ? <li className="border-t border-line pt-3 text-sm text-muted">No snapshots yet.</li> : null}</ol></aside></div>;
}
