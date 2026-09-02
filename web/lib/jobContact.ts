export function hasJobContact(text: string | null | undefined): boolean {
  return (text ?? "").trim().length > 0;
}
