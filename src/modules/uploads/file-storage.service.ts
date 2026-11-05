import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
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

const CONTENT_TYPES: Record<FileType, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
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

interface SupabaseSettings {
  url: string | null;
  key: string | null;
  bucket: string;
}

/**
 * Stores uploaded files in Supabase Storage (a private bucket) when
 * SUPABASE_URL and SUPABASE_SERVICE_KEY are set, otherwise in UPLOAD_DIR.
 * Either way the app links to /api/uploads/<kind>/<file>, and the uploads
 * controller checks who may see each file before sending it.
 */
@Injectable()
export class FileStorageService implements OnModuleInit {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly root: string;
  private readonly remote: { url: string; key: string; bucket: string } | null;

  constructor(config: ConfigService) {
    this.root = resolve(config.getOrThrow<string>('fair.uploads.dir'));
    const sb = config.get<SupabaseSettings>('fair.uploads.supabase');
    this.remote =
      sb?.url && sb.key ? { url: sb.url, key: sb.key, bucket: sb.bucket } : null;
  }

  /** Creates the private bucket on first start if it does not exist yet. */
  async onModuleInit(): Promise<void> {
    if (!this.remote) {
      this.logger.log(`Saving uploads in ${this.root}`);
      return;
    }
    const { bucket } = this.remote;
    try {
      const found = await this.request('GET', `/bucket/${bucket}`);
      if (!found.ok) {
        const created = await this.request('POST', '/bucket', {
          json: { id: bucket, name: bucket, public: false },
        });
        const text = created.ok ? '' : await created.text();
        if (!created.ok && !/already exists/i.test(text)) {
          throw new Error(`HTTP ${created.status}: ${text}`);
        }
      }
      this.logger.log(`Saving uploads in Supabase Storage bucket "${bucket}"`);
    } catch (err) {
      this.logger.error(
        `Could not set up Supabase Storage bucket "${bucket}". Check SUPABASE_URL and SUPABASE_SERVICE_KEY. ${String(err)}`,
      );
    }
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
    if (this.remote) {
      const res = await this.request('POST', this.objectPath(kind, filename), {
        body: file.buffer,
        contentType: CONTENT_TYPES[type],
      });
      if (!res.ok) {
        this.logger.error(
          `Supabase upload failed (HTTP ${res.status}): ${await res.text()}`,
        );
        throw new Error('Could not save the file');
      }
    } else {
      const dir = join(this.root, kind);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, filename), file.buffer);
    }
    return `${URL_PREFIX}${kind}/${filename}`;
  }

  /** Returns a stored file and its content type, or null if it is missing. */
  async read(
    kind: FileKind,
    filename: string,
  ): Promise<{ data: Buffer; contentType: string } | null> {
    if (!this.isValid(kind, filename)) return null;
    const type = filename.split('.').pop() as FileType;
    let data: Buffer | null;
    if (this.remote) {
      const res = await this.request('GET', this.objectPath(kind, filename));
      data = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    } else {
      data = await readFile(this.absolutePath(kind, filename)).catch(
        () => null,
      );
    }
    return data ? { data, contentType: CONTENT_TYPES[type] } : null;
  }

  /** Deletes a stored file. Missing files are ignored. */
  async remove(url: string | null | undefined): Promise<void> {
    const parsed = url ? this.parseUrl(url) : null;
    if (!parsed) return;
    if (this.remote) {
      await this.request(
        'DELETE',
        this.objectPath(parsed.kind, parsed.filename),
      ).catch(() => undefined);
      return;
    }
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

  private objectPath(kind: FileKind, filename: string): string {
    return `/object/${this.remote!.bucket}/${kind}/${filename}`;
  }

  /** Calls the Supabase Storage API with the service key. */
  private request(
    method: string,
    path: string,
    opts: { json?: unknown; body?: Buffer; contentType?: string } = {},
  ): Promise<Response> {
    const { url, key } = this.remote!;
    const headers: Record<string, string> = {
      apikey: key,
      Authorization: `Bearer ${key}`,
    };
    let body: string | Blob | undefined;
    if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.json);
    } else if (opts.body) {
      headers['Content-Type'] = opts.contentType ?? 'application/octet-stream';
      body = new Blob([new Uint8Array(opts.body)]);
    }
    return fetch(`${url}/storage/v1${path}`, { method, headers, body });
  }
}
