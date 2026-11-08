import { AIUB_FACULTIES, isAiubEducation, normalizeFaculty } from './aiub-academics.js';

describe('AIUB academics', () => {
  it('matches the faculty names used in convocation lists', () => {
    expect(normalizeFaculty('Faculty of Science & Technology')).toBe(AIUB_FACULTIES[3]);
    expect(normalizeFaculty(' faculty of  business administration ')).toBe(AIUB_FACULTIES[1]);
    expect(normalizeFaculty('FE')).toBe(AIUB_FACULTIES[2]);
    expect(normalizeFaculty('Faculty of Arts & Social Sciences')).toBe(AIUB_FACULTIES[0]);
    expect(normalizeFaculty('Faculty of Health and Life Sciences')).toBe(
      'Faculty of Health and Life Sciences',
    );
    expect(normalizeFaculty('  ')).toBeNull();
  });

  it('counts a BSc or MSc at AIUB as the AIUB education', () => {
    expect(isAiubEducation({ level: 'bsc', institutionName: 'AIUB' })).toBe(true);
    expect(
      isAiubEducation({
        level: 'msc_1',
        institutionName: 'American International University-Bangladesh',
      }),
    ).toBe(true);
    expect(isAiubEducation({ level: 'hsc', institutionName: 'AIUB' })).toBe(false);
    expect(isAiubEducation({ level: 'bsc', institutionName: 'BRAC University' })).toBe(false);
  });
});
