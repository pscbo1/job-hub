export function hasJobCommNotes(notes: { id: string }[] | null | undefined): boolean {
  return (notes?.length ?? 0) > 0;
}
