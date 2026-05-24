import { Workbook } from 'exceljs';
import { ErpSource } from '../consolidations/entities/consolidation.entity';
import { CcCurrent } from '../cc-current/entities/cc-current.entity';
import {
  applyObservacionesColumnN,
  buildReplayWorkbook,
  replayRowFromBaseLine,
} from './base-export-replay.util';

describe('replayRowFromBaseLine', () => {
  it('truncates trailing semicolon columns beyond N', () => {
    const row = replayRowFromBaseLine('a;b;c;d;e;f;g;h;i;j;k;l;m;n;');
    expect(row).toHaveLength(14);
    expect(row[13]).toBe('n');
  });

  it('preserves column M (index 12) and pads to column N', () => {
    const row = replayRowFromBaseLine('HEADER;;;;;;;;;;;;EncabezadoM');
    expect(row[12]).toBe('EncabezadoM');
    expect(row[13]).toBe('');
    expect(row.length).toBeGreaterThanOrEqual(14);
  });
});

describe('applyObservacionesColumnN', () => {
  it('writes observaciones in column N without overwriting column M', () => {
    const parts = replayRowFromBaseLine(
      ';F 001;15/3/26;1000;1000;;;;;;;;datoColM',
    );
    const out = applyObservacionesColumnN(parts, 'Nota de la app');
    expect(out[12]).toBe('datoColM');
    expect(out[13]).toBe('Nota de la app');
  });
});

describe('buildReplayWorkbook', () => {
  const loadCeosSheet = async (buffer: Buffer) => {
    const wb = new Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet('CEOS_CURRENT');
    if (!ws) throw new Error('missing CEOS_CURRENT sheet');
    return ws;
  };

  it('exports base column M and app observaciones in column N for document rows', async () => {
    const docRaw = ';F 001;15/3/26;1000;1000;;;;;;;;datoColM';
    const headerRow3 = `${';'.repeat(12)}NC`;
    const baseText = [
      'HEADER;;;;;;;;;;;;EncabezadoM',
      ';;;;;;;;;;;;;;;',
      headerRow3,
      'Cliente :99 - 01 - ACME;;;Localidad',
      docRaw,
    ].join('\n');

    const cc = {
      erpSource: ErpSource.CEOS,
      clienteId: '99',
      tienda: '01',
      tipoDocumento: 'F',
      numeroDocumento: '001',
      fechaDoc: new Date('2026-03-15'),
      valor: '1000',
      saldo: '1000',
      observaciones: 'Nota de la app',
      rawRowJson: {
        sourceFile: 'BASE',
        raw: docRaw,
      },
    } as CcCurrent;

    const buffer = await buildReplayWorkbook(ErpSource.CEOS, baseText, [cc]);
    const ws = await loadCeosSheet(buffer);

    expect(ws.getRow(1).getCell(13).value).toBe('EncabezadoM');
    expect(ws.getRow(1).getCell(14).value).toBe('');

    expect(ws.getRow(2).getCell(14).value).toBe('Observaciones');
    expect(ws.getRow(3).getCell(13).value).toBe('NC');
    expect(ws.getRow(3).getCell(14).value).not.toBe('Observaciones');

    const docRowNum = 5;
    expect(ws.getRow(docRowNum).getCell(13).value).toBe('datoColM');
    expect(ws.getRow(docRowNum).getCell(14).value).toBe('Nota de la app');
  });
});
