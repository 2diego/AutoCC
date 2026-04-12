import { decodeUploadBufferToUtf8String } from './decode-upload-buffer.util';

describe('decodeUploadBufferToUtf8String', () => {
  it('decodes UTF-8 válido', () => {
    const buf = Buffer.from('Peña José', 'utf-8');
    expect(decodeUploadBufferToUtf8String(buf)).toBe('Peña José');
  });

  it('usa Windows-1252 si UTF-8 es inválido (p. ej. ñ = 0xF1)', () => {
    const buf = Buffer.from([0x50, 0x65, 0xf1, 0x61]); // "Peña" en cp1252
    expect(decodeUploadBufferToUtf8String(buf)).toBe('Peña');
  });
});
