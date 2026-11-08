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
      { row: 2, aiubId: '01-02425-2', registrationNumber: '223691802', registrationText: '22-36918-02', name: 'MD. ARIFUL HAQUE', program: null, faculty: null, convocation: null },
      { row: 3, aiubId: '16-32398-2', registrationNumber: '223698701', registrationText: '22-36987-01', name: 'AHNAF SADMAN', program: null, faculty: null, convocation: null },
    ]);
  });

  it('reads program, faculty and convocation from the convocation list', () => {
    const { rows, problems } = parseAlumniSheet([
      ['Convocation', 'ID', 'Reg #', 'Name', 'Program', 'Faculty'],
      ['10th Convocation', '04-90464-1', '10-04542-05', 'MUKIT S.M. ABDUL', 'Agriculture Master of Business Administration', 'Faculty of Business Administration'],
      ['10th Convocation', '00-01435-1', '10-04182-04', 'NURUNNAHAR LABANYA', 'Bachelor of Science in Computer Science', 'Faculty of Science & Technology'],
    ]);
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      {
        row: 2,
        aiubId: '04-90464-1',
        registrationNumber: '100454205',
        registrationText: '10-04542-05',
        name: 'MUKIT S.M. ABDUL',
        program: 'Agriculture Master of Business Administration',
        faculty: 'Faculty of Business Administration',
        convocation: '10th Convocation',
      },
      {
        row: 3,
        aiubId: '00-01435-1',
        registrationNumber: '100418204',
        registrationText: '10-04182-04',
        name: 'NURUNNAHAR LABANYA',
        program: 'Bachelor of Science in Computer Science',
        faculty: 'Faculty of Science and Technology',
        convocation: '10th Convocation',
      },
    ]);
  });

  it('reads the current student list, which has no Reg # column', () => {
    const sheet = [
      ['ID', 'Name', 'Program', 'Faculty'],
      ['23-54445-3', 'TAHSIN AHMED', 'Bachelor of Science in Computer Science and Engineering', 'FST'],
      ['23-54445-3', 'SOMEONE ELSE', 'Bachelor of Business Administration', 'FBA'],
      ['23-54446-1', '', '', ''],
    ];
    expect(() => parseAlumniSheet(sheet)).toThrow('Could not find the ID and Reg # columns');
    const { rows, problems } = parseAlumniSheet(sheet, { registration: false });
    expect(rows.map((r) => [r.aiubId, r.name, r.faculty])).toEqual([
      ['23-54445-3', 'TAHSIN AHMED', 'Faculty of Science and Technology'],
      ['23-54446-1', null, null],
    ]);
    expect(problems).toEqual([{ row: 3, message: '23-54445-3 is also on row 2. Row 2 was used.' }]);
  });

  it('finds the heading row below a title and in any column order', () => {
    const { rows } = parseAlumniSheet([
      ['Convocation 2026'],
      [],
      ['Student Name', 'Registration No', 'AIUB ID'],
      ['KANIJ FATEMA', '22-36925-08', '09-15126-3'],
    ]);
    expect(rows).toEqual([
      { row: 4, aiubId: '09-15126-3', registrationNumber: '223692508', registrationText: '22-36925-08', name: 'KANIJ FATEMA', program: null, faculty: null, convocation: null },
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
      'Could not find the ID and Reg # columns',
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
