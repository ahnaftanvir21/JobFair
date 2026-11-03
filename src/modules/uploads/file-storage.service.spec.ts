import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileKind } from './file-kind.enum.js';
import { detectFileType, FileStorageService } from './file-storage.service.js';

const PDF = Buffer.from('%PDF-1.4\n%%EOF');
const PNG = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.alloc(8),
]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

describe('detectFileType', () => {
  it('recognises PDF, PNG and JPG by content', () => {
    expect(detectFileType(PDF)).toBe('pdf');
    expect(detectFileType(PNG)).toBe('png');
    expect(detectFileType(JPG)).toBe('jpg');
  });

  it('rejects anything else', () => {
    expect(detectFileType(Buffer.from('MZ executable'))).toBeNull();
    expect(detectFileType(Buffer.from('<html>'))).toBeNull();
  });
});

describe('FileStorageService', () => {
  let dir: string;
  let storage: FileStorageService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'uploads-'));
    storage = new FileStorageService({
      getOrThrow: () => dir,
    } as unknown as ConfigService);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('stores a CV under a random name and returns its URL', async () => {
    const url = await storage.save(
      { buffer: PDF, size: PDF.length },
      FileKind.CV,
    );
    expect(url).toMatch(/^\/api\/uploads\/cvs\/[0-9a-f-]{36}\.pdf$/);
    const parsed = storage.parseUrl(url)!;
    expect(
      await readFile(storage.absolutePath(parsed.kind, parsed.filename)),
    ).toEqual(PDF);
  });

  it('refuses a picture as a CV and a PDF as a logo', async () => {
    await expect(
      storage.save({ buffer: PNG, size: PNG.length }, FileKind.CV),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      storage.save({ buffer: PDF, size: PDF.length }, FileKind.LOGO),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces the 2 MB image limit', async () => {
    await expect(
      storage.save({ buffer: PNG, size: 3 * 1024 * 1024 }, FileKind.PICTURE),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('requires a file', async () => {
    await expect(storage.save(undefined, FileKind.CV)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('only accepts its own URL shape', () => {
    expect(storage.parseUrl('/api/uploads/cvs/../../.env')).toBeNull();
    expect(storage.parseUrl('/api/uploads/secrets/a.pdf')).toBeNull();
    expect(storage.parseUrl('https://evil.test/x.pdf')).toBeNull();
    expect(
      storage.isValid('cvs', '0b6c3f7e-1d2a-4b5c-8d9e-0f1a2b3c4d5e.pdf'),
    ).toBe(true);
  });

  it('removes files and ignores unknown URLs', async () => {
    const url = await storage.save(
      { buffer: PDF, size: PDF.length },
      FileKind.CV,
    );
    await storage.remove(url);
    const parsed = storage.parseUrl(url)!;
    await expect(
      readFile(storage.absolutePath(parsed.kind, parsed.filename)),
    ).rejects.toThrow();
    await expect(storage.remove('not-a-url')).resolves.toBeUndefined();
    await expect(storage.remove(null)).resolves.toBeUndefined();
  });
});
