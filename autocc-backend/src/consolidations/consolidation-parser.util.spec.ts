import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  documentDateMatchesDmYPattern,
  parseBaseFile,
  parseDocumentDateDmY,
  parseErpListingForDocumentAdd,
  stepTotvsBaseLine,
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

describe('parseDocumentDateDmY', () => {
  it('parses 1-2 digit day/month and 2-digit year as 20xx', () => {
    const d = parseDocumentDateDmY('1/2/26');
    expect(d?.toISOString().slice(0, 10)).toBe('2026-02-01');
  });

  it('normalizes spaces around slashes', () => {
    const d = parseDocumentDateDmY('03 / 03 / 2026');
    expect(d?.toISOString().slice(0, 10)).toBe('2026-03-03');
  });

  it('rejects US-style order when it breaks calendar', () => {
    expect(parseDocumentDateDmY('2/25/2026')).toBeNull();
  });

  it('documentDateMatchesDmYPattern accepts structural d/m/y only', () => {
    expect(documentDateMatchesDmYPattern('5/6/24')).toBe(true);
    expect(documentDateMatchesDmYPattern('2026/3/1')).toBe(false);
  });
});

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
    const result = parseErpListingForDocumentAdd(ErpSource.CEOS, content);

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
    const doc61896 = result.documents.find(
      (doc) =>
        doc.clienteId === '61896' &&
        doc.tienda === '01' &&
        doc.numeroDocumento === 'A06-002200027332',
    );
    expect(doc61896?.fechaDoc).not.toBeNull();
  });

  it('parses TOTVS ERP fixture with real rows', () => {
    const content = readFixture('totvs-erp-cc.csv');
    const result = parseErpListingForDocumentAdd(ErpSource.TOTVS, content);

    expect(result.documents.length).toBeGreaterThan(20);
    expect(
      result.documents.some(
        (doc) =>
          doc.clienteId === '2559' &&
          doc.tienda === '01' &&
          doc.tipoDocumento === 'NF',
      ),
    ).toBe(true);
    const doc27488 = result.documents.find(
      (doc) =>
        doc.clienteId === '61688' &&
        doc.tienda === '01' &&
        doc.numeroDocumento === 'A06-002200027488',
    );
    expect(doc27488?.fechaDoc?.toISOString().slice(0, 10)).toBe('2026-03-30');
  });

  it('keeps client context across TOTVS page breaks', () => {
    const content = [
      'Cliente     :43295     - 01 - AVALO NANCY MARCELA',
      'NF          A06-002200027111                     01/03/2026   31/03/2026                          100,00                100,00         6',
      'Pagina: 2',
      'SIGA/SSRCC001/v.12  Tit por Cob. 2 con Sdo.Actual',
      'TC          Comprobante                          Emision      Venc.Real                                Valor                Saldo    Atraso',
      'NF          A06-002200027365                     03/03/2026   01/04/2026                          359.711,12            359.711,12      5',
    ].join('\n');

    const result = parseErpListingForDocumentAdd(ErpSource.TOTVS, content);
    const carriedDoc = result.documents.find(
      (doc) => doc.numeroDocumento === 'A06-002200027365',
    );

    expect(carriedDoc).toBeDefined();
    expect(carriedDoc?.clienteId).toBe('43295');
    expect(carriedDoc?.tienda).toBe('01');
    expect(result.errors.length).toBe(0);
  });

  it('detects TOTVS doc line in comma-quoted base replay format', () => {
    const state = { currentClient: '61896', currentStore: '01' };
    const line =
      '"","A06-002200027332","2/25/2026","","399,789.95","","125856","","3/28/2026","","","","","","",""';

    const result = stepTotvsBaseLine(line, state);

    expect(result.kind).toBe('doc');
  });

  it('emits parser error when base TOTVS document date has wrong format', () => {
    const content = [
      'Cliente    :61896  - 01 - TEST              ;;;;;;;;;;;;;;',
      ';A06-002200027332;2026/02/25;;399.789,95  ;;125856;;28/03/2026;;;;;;',
    ].join('\n');

    const result = parseBaseFile(ErpSource.TOTVS, content);
    expect(result.documents.length).toBe(0);
    expect(
      result.errors.some((e) => e.errorCode === 'INVALID_DOCUMENT_DATE_FORMAT'),
    ).toBe(true);
  });

  it('parses TOTVS incremental emission date from real line format', () => {
    const content = [
      'Cliente     :61688     - 01 - ALZUGARAY DIEGO ALBERTO',
      'NF         A06-002200027488                      30/03/2026   28/04/2026                            1.804.904,65        1.804.904,65       -19',
    ].join('\n');

    const result = parseErpListingForDocumentAdd(ErpSource.TOTVS, content);
    const doc = result.documents.find(
      (d) => d.numeroDocumento === 'A06-002200027488',
    );

    expect(doc).toBeDefined();
    expect(doc?.fechaDoc?.toISOString().slice(0, 10)).toBe('2026-03-30');
  });

  it('classifies TOTVS AC1-… as nota de crédito (NCC) even if la columna tipo dice NF', () => {
    const content = [
      'Cliente     :61688     - 01 - TEST',
      'NF         AC1-002100029354                      10/04/2026   10/05/2026                            1.000,00                1.000,00         0',
    ].join('\n');

    const result = parseErpListingForDocumentAdd(ErpSource.TOTVS, content);
    const doc = result.documents.find(
      (d) => d.numeroDocumento === 'AC1-002100029354',
    );

    expect(doc).toBeDefined();
    expect(doc?.tipoDocumento).toBe('NCC');
  });

  it('classifies TOTVS AD4-… as nota de débito (ND) even if la columna tipo dice NF', () => {
    const content = [
      'Cliente     :61688     - 01 - TEST',
      'NF         AD4-001400000862                      10/04/2026   10/05/2026                            500,00                500,00         0',
    ].join('\n');

    const result = parseErpListingForDocumentAdd(ErpSource.TOTVS, content);
    const doc = result.documents.find(
      (d) => d.numeroDocumento === 'AD4-001400000862',
    );

    expect(doc).toBeDefined();
    expect(doc?.tipoDocumento).toBe('ND');
  });
});
