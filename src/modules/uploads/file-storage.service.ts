import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileKind } from './file-kind.enum.js';

type FileType = 'pdf' | 'png' | 'jpg';

const MB = 1024 * 1024;

/** Largest file multer will accept at all. Per-kind limits are checked after. */
export const MAX_UPLOAD_BYTES = 5 * MB;

const RULES: Record<FileKind, { types: FileType[]; maxBytes: number }> = {
  [FileKind.PICTURE]: { types: ['png', 'jpg'], maxBytes: 2 * MB },
  [FileKind.LOGO]: { types: ['png', 'jpg'], maxBytes: 2 * MB },
  [FileKind.CV]: { types: ['pdf'], maxBytes: 5 * MB },
  [FileKind.ATTACHMENT]: { types: ['pdf'], maxBytes: 5 * MB },
};

const URL_PREFIX = '/api/uploads/';
const FILENAME_PATTERN = /^[0-9a-f-]{36}\.(pdf|png|jpg)$/;

export interface UploadedFileLike {
  buffer: Buffer;
  size: number;
}

/** Detects the real file type from its first bytes, ignoring name and mimetype. */
export function detectFileType(buffer: Buffer): FileType | null {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return 'png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  return null;
}

@Injectable()
export class FileStorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.getOrThrow<string>('fair.uploads.dir'));
  }

  /** Validates and stores a file. Returns its URL, e.g. /api/uploads/cvs/ID.pdf */
  async save(
    file: UploadedFileLike | undefined,
    kind: FileKind,
  ): Promise<string> {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('A file is required in the "file" field');
    }
    const rule = RULES[kind];
    const type = detectFileType(file.buffer);
    if (!type || !rule.types.includes(type)) {
      const allowed = rule.types.map((t) => t.toUpperCase()).join(' or ');
      throw new BadRequestException(`File must be a ${allowed}`);
    }
    if (file.size > rule.maxBytes) {
      throw new PayloadTooLargeException(
        `File must be at most ${rule.maxBytes / MB} MB`,
      );
    }

    const filename = `${randomUUID()}.${type}`;
    const dir = join(this.root, kind);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), file.buffer);
    return `${URL_PREFIX}${kind}/${filename}`;
  }

  /** Deletes a stored file. Missing files are ignored. */
  async remove(url: string | null | undefined): Promise<void> {
    const parsed = url ? this.parseUrl(url) : null;
    if (!parsed) return;
    await unlink(this.absolutePath(parsed.kind, parsed.filename)).catch(
      () => undefined,
    );
  }

  /** Splits a stored URL into kind and filename, or null if it is not ours. */
  parseUrl(url: string): { kind: FileKind; filename: string } | null {
    if (!url.startsWith(URL_PREFIX)) return null;
    const [kind, filename, ...rest] = url.slice(URL_PREFIX.length).split('/');
    if (rest.length || !this.isValid(kind, filename)) return null;
    return { kind: kind as FileKind, filename };
  }

  isValid(kind: string, filename: string): boolean {
    return (
      Object.values(FileKind).includes(kind as FileKind) &&
      FILENAME_PATTERN.test(filename ?? '')
    );
  }

  urlFor(kind: FileKind, filename: string): string {
    return `${URL_PREFIX}${kind}/${filename}`;
  }

  absolutePath(kind: FileKind, filename: string): string {
    return join(this.root, kind, filename);
  }

  get rootDir(): string {
    return this.root;
  }
}
