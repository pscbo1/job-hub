"use client";

import { useMemo, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  /** Cell renderer. Falls back to String(sortValue). */
  render?: (row: T) => React.ReactNode;
  /** Value used for sorting; enables the sortable header when provided. */
  sortValue?: (row: T) => string | number;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  getRowKey: (row: T) => string;
  /** Optional initial sort column key. */
  initialSortKey?: string;
  initialSortDir?: "asc" | "desc";
  empty?: React.ReactNode;
  colGroup?: ReactNode;
  wrapperClassName?: string;
  tableClassName?: string;
}

/**
 * A lean, typed, sortable table — sticky header, zebra rows, hover, and
 * horizontal scroll on narrow screens. No external table dependency.
 */
export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  initialSortKey,
  initialSortDir = "desc",
  empty,
  colGroup,
  wrapperClassName,
  tableClassName,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | undefined>(initialSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initialSortDir);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [rows, columns, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (rows.length === 0 && empty) {
    return <>{empty}</>;
  }

  return (
    <div
      className={cn(
        "max-w-full overflow-x-auto rounded-2xl border border-line shadow-card",
        wrapperClassName,
      )}
    >
      <table
        className={cn(
          "w-full min-w-[640px] border-collapse bg-surface text-left text-sm",
          tableClassName,
        )}
      >
        {colGroup}
        <thead>
          <tr className="border-b border-line bg-bg text-xs uppercase tracking-wider text-muted">
            {columns.map((c) => {
              const active = sortKey === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={cn("px-4 py-3 font-medium", c.headerClassName)}
                  aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {c.sortValue ? (
                    <button
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        "inline-flex items-center gap-1 transition-colors hover:text-ink",
                        active && "text-ink",
                      )}
                    >
                      {c.header}
                      <span aria-hidden="true" className="text-[10px]">
                        {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={getRowKey(row)}
              className="border-b border-line last:border-b-0 transition-colors hover:bg-bg/60"
            >
              {columns.map((c) => (
                <td key={c.key} className={cn("px-4 py-3 align-middle text-ink", c.className)}>
                  {c.render ? c.render(row) : c.sortValue ? String(c.sortValue(row)) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
