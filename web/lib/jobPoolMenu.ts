export function clampMenuPosition(
  x: number,
  y: number,
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const w = 196;
  const h = 96;
  const pad = 8;
  return {
    x: Math.max(pad, Math.min(x, viewport.width - w - pad)),
    y: Math.max(pad, Math.min(y, viewport.height - h - pad)),
  };
}

export function companyAlreadyListed(list: string[], company: string): boolean {
  const needle = company.trim().toLowerCase();
  if (!needle) return false;
  return list.some((item) => item.trim().toLowerCase() === needle);
}
