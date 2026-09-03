export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/^[=@+\-\t\r]/.test(s)) return `'${s.replace(/'/g, "''")}`;
  return s;
}

export function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
