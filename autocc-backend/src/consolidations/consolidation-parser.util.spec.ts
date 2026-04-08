import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseBaseFile,
  parseIncrementalFile,
} from './consolidation-parser.util';
import { ErpSource } from './entities/consolidation.entity';

const readFixture = (fileName: string): string => {
  const filePath = path.resolve(
    process.cwd(),
    '..',
    'EjemplosArchivosERP',
    fileName,
  );
  return fs.readFileSync(filePath, 'utf-8');
};

describe('consolidation parser fixtures', () => {
  it('parses CEOS base fixture with real rows', () => {
    const content = readFixture('ceosCuentaCorriente.csv');
    const result = parseBaseFile(ErpSource.CEOS, content);

    expect(result.documents.length).toBeGreaterThan(400);
    expect(
      result.documents.some(
        (doc) =>
          doc.clienteId === '61896' &&
          doc.tienda === '01' &&
          doc.tipoDocumento === 'F' &&
          doc.numeroDocumento === '6A51622',
      ),
    ).toBe(true);
    expect(
      result.errors.some(
        (err) =>
          err.sourceFile === 'BASE' &&
          err.lineNumber === 2 &&
          err.errorCode === 'MISSING_CLIENT_CONTEXT',
      ),
    ).toBe(false);
  });

  it('parses CEOS ERP fixture with real rows', () => {
    const content = readFixture('ceos-erp-cc.csv');
    const result = parseIncrementalFile(ErpSource.CEOS, content);

    expect(result.documents.length).toBeGreaterThan(20);
    expect(
      result.documents.some(
        (doc) =>
          doc.clienteId === '30187' &&
          doc.tipoDocumento === 'F' &&
          doc.numeroDocumento === '6A051791',
      ),
    ).toBe(true);
  });

  it('parses TOTVS base fixture with real rows', () => {
    const content = readFixture('totvsCuentaCorriente.csv');
    const result = parseBaseFile(ErpSource.TOTVS, content);

    expect(result.documents.length).toBeGreaterThan(350);
    expect(
      result.documents.some(
        (doc) =>
          doc.clienteId === '61896' &&
          doc.tienda === '01' &&
          doc.numeroDocumento === 'A06-002200027332',
      ),
    ).toBe(true);
    expect(
      result.errors.some(
        (err) =>
          err.sourceFile === 'BASE' &&
          err.lineNumber <= 3 &&
          err.errorCode === 'MISSING_CLIENT_CONTEXT',
      ),
    ).toBe(false);
  });

  it('parses TOTVS ERP fixture with real rows', () => {
    const content = readFixture('totvs-erp-cc.csv');
    const result = parseIncrementalFile(ErpSource.TOTVS, content);

    expect(result.documents.length).toBeGreaterThan(20);
    expect(
      result.documents.some(
        (doc) =>
          doc.clienteId === '2559' &&
          doc.tienda === '01' &&
          doc.tipoDocumento === 'NF',
      ),
    ).toBe(true);
  });
});
