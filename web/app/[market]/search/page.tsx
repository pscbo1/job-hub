import { notFound } from "next/navigation";

import { CollectJobsPage } from "@/components/CollectJobsPage";
import { MARKET_ORDER, parseMarketId } from "@/lib/markets";

export function generateStaticParams() {
  return MARKET_ORDER.map((market) => ({ market }));
}

export default async function MarketSearchPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: raw } = await params;
  const market = parseMarketId(raw);
  if (!market) notFound();
  return <CollectJobsPage market={market} />;
}
