import { BadRequestException } from '@nestjs/common';
import readXlsxFile from 'read-excel-file/node';
import { AIUB_ID } from '../students/dto/student-profile.dto.js';

export interface AlumniListRow {
  /** Row number in the spreadsheet, starting at 1. */
  row: number;
  aiubId: string;
  /** Normalized: letters and digits only, upper case. */
  registrationNumber: string;
  /** As written in the sheet, for showing to the admin. */
  registrationText: string;
  name: string | null;
}

export interface AlumniListProblem {
  row: number;
  message: string;
}

export interface ParsedAlumniList {
  rows: AlumniListRow[];
  problems: AlumniListProblem[];
}

export type AlumniUpload = {
  buffer: Buffer;
  originalname?: string;
};

const WRONG_FILE =
  'Upload the list as .xlsx or .csv. In Google Sheets: File > Download > Microsoft Excel (.xlsx).';
const NO_HEADER =
  'Could not find the ID and Grad Reg columns. The first row should have headings like "ID", "Grad Reg" and "Name".';

/**
 * Registration numbers are compared on letters and digits only, so
 * "22-36918-02", "22 36918 02" and "22/36918/02" are the same number.
 */
export function normalizeRegistration(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Reads the first sheet that has the ID and registration columns. */
export async function readAlumniFile(file: AlumniUpload): Promise<string[][]> {
  const name = (file.originalname ?? '').toLowerCase();
  const isZip = file.buffer.subarray(0, 2).toString('latin1') === 'PK';
  if (isZip) {
    let sheets: Awaited<ReturnType<typeof readXlsxFile>>;
    try {
      sheets = await readXlsxFile(file.buffer);
    } catch {
      throw new BadRequestException(`This file could not be read. ${WRONG_FILE}`);
    }
    const grids = sheets.map((s) =>
      s.data.map((r) => r.map((cell) => cellText(cell))),
    );
    return grids.find((g) => findHeader(g)) ?? grids[0] ?? [];
  }
  if (/\.(csv|tsv|txt)$/.test(name)) {
    return parseCsv(file.buffer.toString('utf8'));
  }
  throw new BadRequestException(WRONG_FILE);
}

/** Turns the sheet into rows, with a list of the rows that were skipped and why. */
export function parseAlumniSheet(sheet: string[][]): ParsedAlumniList {
  const header = findHeader(sheet);
  if (!header) throw new BadRequestException(NO_HEADER);

  const rows: AlumniListRow[] = [];
  const problems: AlumniListProblem[] = [];
  const seen = new Map<string, AlumniListRow>();

  for (let i = header.index + 1; i < sheet.length; i++) {
    const line = sheet[i];
    const row = i + 1;
    const aiubId = (line[header.id] ?? '').replace(/\s/g, '');
    const rawReg = (line[header.reg] ?? '').trim();
    const name =
      header.name === -1
        ? ''
        : (line[header.name] ?? '').replace(/\s+/g, ' ').trim();
    if (!aiubId && !rawReg && !name) continue; // empty row

    if (!AIUB_ID.test(aiubId)) {
      problems.push({
        row,
        message: aiubId
          ? `ID "${aiubId}" does not look like 22-48123-1`
          : 'ID is empty',
      });
      continue;
    }
    const registrationNumber = normalizeRegistration(rawReg);
    if (registrationNumber.length < 4 || registrationNumber.length > 30) {
      problems.push({
        row,
        message: rawReg
          ? `Registration number "${rawReg}" for ${aiubId} is not valid`
          : `Registration number for ${aiubId} is empty`,
      });
      continue;
    }
    const earlier = seen.get(aiubId);
    if (earlier) {
      if (earlier.registrationNumber !== registrationNumber) {
        problems.push({
          row,
          message: `${aiubId} is also on row ${earlier.row} with a different registration number. Row ${earlier.row} was used.`,
        });
      }
      continue;
    }
    const entry: AlumniListRow = {
      row,
      aiubId,
      registrationNumber,
      registrationText: rawReg.replace(/\s+/g, ' ').slice(0, 40),
      name: name ? name.slice(0, 150) : null,
    };
    seen.set(aiubId, entry);
    rows.push(entry);
  }
  return { rows, problems };
}

function findHeader(
  sheet: string[][],
): { index: number; id: number; reg: number; name: number } | null {
  for (let index = 0; index < Math.min(sheet.length, 10); index++) {
    const cells = sheet[index].map((c) =>
      c.toLowerCase().replace(/[^a-z]/g, ''),
    );
    const id = cells.findIndex((c) =>
      ['id', 'aiubid', 'studentid', 'aiubstudentid'].includes(c),
    );
    const reg = cells.findIndex((c) => c.includes('reg'));
    if (id !== -1 && reg !== -1) {
      return {
        index,
        id,
        reg,
        name: cells.findIndex((c) => c.includes('name')),
      };
    }
  }
  return null;
}

function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

/** Small CSV reader: quoted fields, "" inside quotes, commas or tabs, CRLF. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === sep) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}
