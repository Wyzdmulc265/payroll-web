/**
 * Company departments are stored as a per-business `company.departments`
 * setting holding a JSON array of names (no migration needed — settings are
 * already business-scoped). The employee form offers this list; the API
 * accepts any non-empty department string, so departments assigned before
 * the list existed keep working.
 */

export const DEPARTMENTS_SETTING_KEY = 'company.departments';
export const MAX_DEPARTMENTS = 50;
export const MAX_DEPARTMENT_LENGTH = 100;

/** Lenient parse for display: never throws, skips bad entries. */
export function parseDepartmentsSetting(raw: string | undefined | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const name = item.trim();
      if (!name || name.length > MAX_DEPARTMENT_LENGTH) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
      if (out.length >= MAX_DEPARTMENTS) break;
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Strict validation for writes. Returns an error message, or null when the
 * value is acceptable. Empty array is allowed (falls back to departments
 * seen on employees).
 */
export function validateDepartmentsValue(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 'Departments must be a JSON array of department names';
  }
  if (!Array.isArray(parsed)) return 'Departments must be a JSON array of department names';
  if (parsed.length > MAX_DEPARTMENTS) return `At most ${MAX_DEPARTMENTS} departments are allowed`;
  const seen = new Set<string>();
  for (const item of parsed) {
    if (typeof item !== 'string' || !item.trim()) return 'Every department must be a non-empty name';
    if (item.trim().length > MAX_DEPARTMENT_LENGTH) {
      return `Department names must be at most ${MAX_DEPARTMENT_LENGTH} characters`;
    }
    const key = item.trim().toLowerCase();
    if (seen.has(key)) return `Duplicate department "${item.trim()}"`;
    seen.add(key);
  }
  return null;
}
