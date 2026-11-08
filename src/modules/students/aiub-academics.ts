/** AIUB faculties. Current students pick one; list rows are matched to these. */
export const AIUB_FACULTIES = [
  'Faculty of Arts and Social Sciences',
  'Faculty of Business Administration',
  'Faculty of Engineering',
  'Faculty of Science and Technology',
] as const;

export const AIUB_NAME = 'American International University-Bangladesh';

/** Institution names that count as AIUB in the education list. */
const AIUB_INSTITUTION = /american\s+international\s+university|\baiub\b/i;

/** Degree levels an AIUB entry can have: a bachelor's or master's. */
const UNIVERSITY_LEVELS = ['bsc', 'msc_1', 'msc_2'];

export function isAiubEducation(e: {
  level: string;
  institutionName: string;
}): boolean {
  return (
    UNIVERSITY_LEVELS.includes(e.level) && AIUB_INSTITUTION.test(e.institutionName)
  );
}

/**
 * Maps the faculty text in the convocation list to one of AIUB_FACULTIES,
 * so "Faculty of Science & Technology" and "FST" count together.
 * Text that matches none is kept as written.
 */
export function normalizeFaculty(text: string | null | undefined): string | null {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const t = clean.toLowerCase();
  const short = t.replace(/[^a-z]/g, '');
  if (t.includes('business') || short === 'fba') return AIUB_FACULTIES[1];
  if (t.includes('arts') || t.includes('social') || short === 'fass')
    return AIUB_FACULTIES[0];
  if (t.includes('engineering') || short === 'fe') return AIUB_FACULTIES[2];
  if ((t.includes('science') && t.includes('tech')) || short === 'fst')
    return AIUB_FACULTIES[3];
  return clean.slice(0, 150);
}
