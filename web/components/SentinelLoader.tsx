export function SentinelLoader({ label = "Loading Job Hub" }: { label?: string }) {
  return (
    <div
      className="flex min-h-[55vh] flex-col items-center justify-center px-6 py-16 text-center"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="sentinel-loader" aria-hidden="true">
        <div className="sentinel-loader__tilt">
          <img src="/brand/job-hub.png" alt="" className="sentinel-loader__mark" />
          <span className="sentinel-loader__orbit sentinel-loader__orbit--one" />
          <span className="sentinel-loader__orbit sentinel-loader__orbit--two" />
          <span className="sentinel-loader__spark sentinel-loader__spark--one" />
          <span className="sentinel-loader__spark sentinel-loader__spark--two" />
        </div>
      </div>
      <p className="mt-6 text-sm font-medium text-ink">{label}</p>
      <p className="mt-1 text-xs text-muted">Syncing the local engine and web surface.</p>
    </div>
  );
}
