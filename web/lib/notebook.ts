/** Notebook pages: free writing with #topic hashtags. Not Materials. */

export const NOTEBOOK_COPY = {
  title: "Notebook",
  subtitle:
    "Free writing for yourself. Pages are not attached to applications and are not added to packets.",
  newPage: "New page",
  search: "Search pages",
  empty: "No pages yet.",
  emptySearch: "No pages match this search.",
  untitled: "Untitled",
  delete: "Delete page",
  sortUpdated: "Recently updated",
  sortTitle: "Title",
  editorPlaceholder: "Write in markdown. Type #topic to add a topic.",
} as const;

export interface NotebookPageRow {
  id: string;
  title: string;
  markdown_body: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  topics: string[];
}

const HASHTAG = /(?<![#\w])#([^\s#]{1,40})/g;

export function extractNotebookTopics(...texts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of texts) {
    const matches = text.matchAll(HASHTAG);
    for (const match of matches) {
      const topic = match[1]?.trim().replace(/[.,;:!?]+$/, "");
      if (!topic) continue;
      const key = topic.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(topic);
    }
  }
  return out;
}

export function notebookMatchesQuery(page: NotebookPageRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    page.title.toLowerCase().includes(needle) || page.markdown_body.toLowerCase().includes(needle)
  );
}

export function notebookMatchesTopic(page: NotebookPageRow, topic: string): boolean {
  const wanted = topic.trim().replace(/^#/, "").toLowerCase();
  if (!wanted) return true;
  const topics = page.topics.length > 0 ? page.topics : extractNotebookTopics(page.title, page.markdown_body);
  return topics.some((item) => item.toLowerCase() === wanted);
}

export function uniqueNotebookTopics(pages: readonly NotebookPageRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const page of pages) {
    const topics =
      page.topics.length > 0 ? page.topics : extractNotebookTopics(page.title, page.markdown_body);
    for (const topic of topics) {
      const key = topic.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(topic);
    }
  }
  return out;
}
