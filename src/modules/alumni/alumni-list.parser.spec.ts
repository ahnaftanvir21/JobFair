import {
  normalizeRegistration,
  parseAlumniSheet,
  parseCsv,
  readAlumniFile,
} from './alumni-list.parser.js';

describe('alumni list parser', () => {
  it('reads the columns of the fair office sheet', () => {
    const { rows, problems } = parseAlumniSheet([
      ['ID', 'Grad Reg', 'Name'],
      ['01-02425-2', '22-36918-02', 'MD. ARIFUL  HAQUE'],
      ['16-32398-2', '22-36987-01', 'AHNAF SADMAN'],
    ]);
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      { row: 2, aiubId: '01-02425-2', registrationNumber: '223691802', registrationText: '22-36918-02', name: 'MD. ARIFUL HAQUE' },
      { row: 3, aiubId: '16-32398-2', registrationNumber: '223698701', registrationText: '22-36987-01', name: 'AHNAF SADMAN' },
    ]);
  });

  it('finds the heading row below a title and in any column order', () => {
    const { rows } = parseAlumniSheet([
      ['Convocation 2026'],
      [],
      ['Student Name', 'Registration No', 'AIUB ID'],
      ['KANIJ FATEMA', '22-36925-08', '09-15126-3'],
    ]);
    expect(rows).toEqual([
      { row: 4, aiubId: '09-15126-3', registrationNumber: '223692508', registrationText: '22-36925-08', name: 'KANIJ FATEMA' },
    ]);
  });

  it('skips bad rows with the reason and keeps the rest', () => {
    const { rows, problems } = parseAlumniSheet([
      ['ID', 'Grad Reg', 'Name'],
      ['12-20393-1', '22-36935-10', 'FARJANA FARUQUE'],
      ['1220393', '22-36935-11', 'BAD ID'],
      ['13-23331-1', '', 'NO NUMBER'],
      ['', '', ''],
      ['12-20393-1', '22-99999-99', 'SAME ID, OTHER NUMBER'],
      ['12-20393-1', '22-36935-10', 'EXACT REPEAT'],
    ]);
    expect(rows.map((r) => r.aiubId)).toEqual(['12-20393-1']);
    expect(problems).toEqual([
      { row: 3, message: 'ID "1220393" does not look like 22-48123-1' },
      { row: 4, message: 'Registration number for 13-23331-1 is empty' },
      {
        row: 6,
        message:
          '12-20393-1 is also on row 2 with a different registration number. Row 2 was used.',
      },
    ]);
  });

  it('refuses a sheet without ID and registration headings', () => {
    expect(() => parseAlumniSheet([['Name', 'Phone']])).toThrow(
      'Could not find the ID and Grad Reg columns',
    );
  });

  it('compares registration numbers on letters and digits only', () => {
    expect(normalizeRegistration(' 22-36918-02 ')).toBe('223691802');
    expect(normalizeRegistration('22 36918/02')).toBe('223691802');
  });

  it('reads CSV with quotes, commas inside quotes and CRLF', () => {
    expect(parseCsv('﻿ID,Grad Reg,Name\r\n"01-02425-2",22-36918-02,"HAQUE, MD."\r\n')).toEqual([
      ['ID', 'Grad Reg', 'Name'],
      ['01-02425-2', '22-36918-02', 'HAQUE, MD.'],
    ]);
  });

  it('rejects files that are not a spreadsheet', async () => {
    await expect(
      readAlumniFile({ buffer: Buffer.from('%PDF-1.4'), originalname: 'list.pdf' }),
    ).rejects.toThrow('Upload the list as .xlsx or .csv');
  });
});
