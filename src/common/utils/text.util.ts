/** Escapes % and _ so user search text is matched literally in ILIKE. */
export function likePattern(value: string): string {
  return `%${value.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Trims strings coming from requests; leaves other values alone. */
export function trimValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Trims strings and turns empty ones into null, so optional fields can be cleared. */
/** Website: empty becomes null; "www.site.com" becomes "https://www.site.com". */
export function websiteValue({ value }: { value: unknown }): unknown {
  const v = emptyToNull({ value });
  if (typeof v !== 'string' || /^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v;
  return `https://${v}`;
}

export function emptyToNull({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
