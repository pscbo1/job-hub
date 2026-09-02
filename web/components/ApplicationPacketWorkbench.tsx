"use client";

import { useEffect, useState } from "react";

import { MaterialsArea } from "@/components/ApplicationWorkspace";
import { SubmitConfirm } from "@/components/SubmitConfirm";
import { getApplication, type Application } from "@/lib/api";
import { ASSIST_COPY } from "@/lib/applicationUi";

export function ApplicationPacketWorkbench({ appId }: { appId: string }) {
  const [app, setApp] = useState<Application | null>(null);
  const [missing, setMissing] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setMissing(false);
    void getApplication(appId).then((row) => {
      if (cancelled) return;
      if (!row) {
        setMissing(true);
        setApp(null);
        return;
      }
      setApp(row);
    });
    return () => {
      cancelled = true;
    };
  }, [appId, tick]);

  if (missing) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-sm text-muted">
        Application not found.
        <a href="/applications" className="ml-2 text-ink underline">
          {ASSIST_COPY.backOverview}
        </a>
      </div>
    );
  }

  if (!app) {
    return <div className="mx-auto max-w-3xl px-5 py-16 text-sm text-muted">{ASSIST_COPY.loading}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-sm text-muted">
        {app.employer} · {app.title || "Untitled"}
      </p>
      <div className="mt-6">
        <MaterialsArea
          app={app}
          standalone
          onChanged={() => setTick((n) => n + 1)}
          onSubmitRequest={app.stage === "draft" ? () => setSubmitOpen(true) : undefined}
        />
      </div>
      {submitOpen && (
        <SubmitConfirm
          app={app}
          onClose={() => setSubmitOpen(false)}
          onDone={() => {
            setSubmitOpen(false);
            setTick((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
