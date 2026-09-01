import { redirect } from "next/navigation";

import { MARKET_ORDER } from "@/lib/markets";

export function generateStaticParams() {
  return MARKET_ORDER.map((market) => ({ market }));
}

export default function MarketMyJobsRedirect() {
  redirect("/tasks");
}
