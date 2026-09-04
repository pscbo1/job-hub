import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { COMMUNICATION_COPY } from "./copy";
import { SOURCE_OPTIONS } from "./types";

export function CommunicationFilters({
  query,
  source,
  market,
  onQuery,
  onSource,
  onMarket,
}: {
  query: string;
  source: string;
  market: string;
  onQuery: (value: string) => void;
  onSource: (value: string) => void;
  onMarket: (value: string) => void;
}) {
  const selected = source.split(",").filter(Boolean);

  function toggle(id: string, checked: boolean) {
    onSource(
      checked
        ? [...new Set([...selected, id])].join(",")
        : selected.filter((item) => item !== id).join(","),
    );
  }

  return (
    <section className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
      <Input
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder={COMMUNICATION_COPY.search}
        className="min-w-[16rem] flex-1"
      />
      <span className="text-sm text-muted">Sources</span>
      {SOURCE_OPTIONS.map((item) => (
        <label key={item.id} className="inline-flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={selected.includes(item.id)}
            onChange={(event) => toggle(item.id, event.target.checked)}
          />
          {item.label}
        </label>
      ))}
      <div className="ml-auto w-36">
        <Select
          aria-label="Market"
          value={market}
          onChange={(event) => onMarket(event.target.value)}
        >
          <option value="all">All</option>
          <option value="cn">CN</option>
          <option value="en">EN</option>
          <option value="unclassified">Unclassified</option>
        </Select>
      </div>
    </section>
  );
}
