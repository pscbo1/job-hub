import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-24 text-center">
      <p className="text-6xl font-bold text-stone-300">⚡</p>
      <h1 className="mt-4 text-2xl font-semibold text-ink">You&apos;re offline</h1>
      <p className="mt-2 text-muted">
        Job Hub runs against your local API, which isn&apos;t reachable right now.
        Reconnect and try again — your data never left your machine.
      </p>
      <div className="mt-6 flex justify-center">
        <Link href="/jobs">
          <Button>Retry</Button>
        </Link>
      </div>
    </div>
  );
}
