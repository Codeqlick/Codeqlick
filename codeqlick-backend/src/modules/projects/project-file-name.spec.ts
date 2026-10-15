import { describe, expect, it } from 'vitest';
import {
  attachmentDisposition,
  cleanContentType,
  cleanFileName,
  MAX_FILE_NAME_LENGTH,
} from './project-file-name.js';

describe('cleanFileName', () => {
  it('keeps ordinary names, accents included', () => {
    expect(cleanFileName('Diseño final v2.pdf')).toBe('Diseño final v2.pdf');
  });

  it('drops folders, control characters and leading dots', () => {
    expect(cleanFileName('../../etc/passwd')).toBe('passwd');
    expect(cleanFileName('C:\\Users\\ana\\informe.docx')).toBe('informe.docx');
    expect(cleanFileName('a\u0000b\r\n"c".txt')).toBe('abc.txt');
    expect(cleanFileName('.env')).toBe('env');
  });

  it('falls back to a generic name when nothing is left', () => {
    expect(cleanFileName(undefined)).toBe('file');
    expect(cleanFileName(' ... ')).toBe('file');
  });

  it('shortens long names but keeps the extension', () => {
    const name = cleanFileName(`${'a'.repeat(300)}.zip`);
    expect(name).toHaveLength(MAX_FILE_NAME_LENGTH);
    expect(name.endsWith('.zip')).toBe(true);
  });
});

describe('cleanContentType', () => {
  it('accepts valid media types and rejects anything else', () => {
    expect(cleanContentType('application/PDF')).toBe('application/pdf');
    expect(cleanContentType('text/html; charset=utf-8')).toBe('application/octet-stream');
    expect(cleanContentType(undefined)).toBe('application/octet-stream');
  });
});

describe('attachmentDisposition', () => {
  it('sends an ASCII fallback and the exact UTF-8 name', () => {
    expect(attachmentDisposition("Diseño (final)'s.pdf")).toBe(
      "attachment; filename=\"Diseno (final)'s.pdf\"; filename*=UTF-8''Dise%C3%B1o%20%28final%29%27s.pdf",
    );
  });
});
