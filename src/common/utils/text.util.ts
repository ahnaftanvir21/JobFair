/** Escapes % and _ so user search text is matched literally in ILIKE. */
export function likePattern(value: string): string {
  return `%${value.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Trims strings coming from requests; leaves other values alone. */
export function trimValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Trims strings and turns empty ones into null, so optional fields can be cleared. */
export function emptyToNull({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
