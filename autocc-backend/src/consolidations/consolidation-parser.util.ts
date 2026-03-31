import { parseMoneyERP } from '../common/utils/parse-money-erp.util';
import { ErpSource } from './entities/consolidation.entity';

export type ParsedDocument = {
  erpSource: ErpSource;
  clienteId: string;
  tienda: string;
  tipoDocumento: string;
  numeroDocumento: string;
  fechaDoc: Date | null;
  valor: string | null;
  saldo: string | null;
  rawRowJson: Record<string, unknown>;
};

export type ParserError = {
  sourceFile: 'BASE' | 'ERP';
  lineNumber: number;
  rawLine: string;
  errorCode: string;
  message: string;
};

export type ParseResult = {
  documents: ParsedDocument[];
  errors: ParserError[];
};

const parseDateDmy = (raw?: string): Date | null => {
  if (!raw) return null;
  const cleaned = raw.trim();
  const match = cleaned.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseMoneyToDecimal = (raw?: string): string | null => {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const parsed = parseMoneyERP(cleaned);
  return parsed.toFixed(2);
};

const buildTotvsTypeFromToken = (token: string): string => {
  const t = token.trim().toUpperCase();
  if (t.startsWith('REC')) return 'RA';
  if (t.startsWith('NCE')) return 'NCE';
  if (t.startsWith('NCC')) return 'NCC';
  if (t.startsWith('RA')) return 'RA';
  return 'NF';
};

const normalizeTotvsDocumentNumber = (token: string): string => token.trim();

const normalizeCeosDocument = (
  token: string,
): { tipoDocumento: string; numeroDocumento: string } | null => {
  const t = token.trim().toUpperCase();
  if (!t) return null;

  if (t.startsWith('REC')) {
    return {
      tipoDocumento: 'R',
      numeroDocumento: t.replace(/^REC[.\s-]*/i, ''),
    };
  }

  const match = t.match(/^([FCDR])\s*([A-Z0-9.-]+)?$/);
  if (!match) return null;
  const [, tipo, numero] = match;
  return { tipoDocumento: tipo, numeroDocumento: (numero ?? '').trim() };
};

const parseCeosBase = (content: string): ParseResult => {
  const lines = content.split(/\r?\n/);
  const documents: ParsedDocument[] = [];
  const errors: ParserError[] = [];
  let currentClient = '';
  let currentStore = '01';

  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    const trimmed = line.trim();
    if (!trimmed) return;

    const clientHeader = trimmed.match(/Cliente\s*:?\s*(\d+)\s*-\s*(\d+)/i);
    if (clientHeader) {
      currentClient = clientHeader[1];
      currentStore = clientHeader[2];
      return;
    }

    if (!trimmed.startsWith(';')) return;
    const parts = line.split(';');
    const docToken = (parts[1] ?? '').trim();
    if (!docToken) return;

    const normalized = normalizeCeosDocument(docToken);
    if (!normalized || !normalized.numeroDocumento) return;

    if (!currentClient) {
      errors.push({
        sourceFile: 'BASE',
        lineNumber,
        rawLine: line,
        errorCode: 'MISSING_CLIENT_CONTEXT',
        message: 'No se pudo inferir cliente para línea de documento CEOS base',
      });
      return;
    }

    const fechaDoc = parseDateDmy(parts[2]);
    const valor = parseMoneyToDecimal(parts[3]);
    const saldo = parseMoneyToDecimal(parts[4]) ?? valor;

    documents.push({
      erpSource: ErpSource.CEOS,
      clienteId: currentClient,
      tienda: currentStore || '01',
      tipoDocumento: normalized.tipoDocumento,
      numeroDocumento: normalized.numeroDocumento,
      fechaDoc,
      valor,
      saldo,
      rawRowJson: { sourceFile: 'BASE', raw: line },
    });
  });

  return { documents, errors };
};

const parseCeosIncremental = (content: string): ParseResult => {
  const lines = content.split(/\r?\n/);
  const documents: ParsedDocument[] = [];
  const errors: ParserError[] = [];

  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    const trimmed = line.replace(/^"+|"+$/g, '').trim();
    if (!trimmed) return;

    const tailMatch = trimmed.match(
      /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+\d+\s+([FCDR])\s+([A-Z0-9.-]+)\s+(-?[\d.,]+)\s*$/i,
    );
    if (!tailMatch) return;

    const clientMatch = trimmed.match(/^(\d+)\s+/);
    if (!clientMatch) {
      errors.push({
        sourceFile: 'ERP',
        lineNumber,
        rawLine: line,
        errorCode: 'MISSING_CLIENT_ID',
        message: 'No se pudo extraer cliente en CEOS ERP',
      });
      return;
    }

    const [, fechaDocRaw, , tipoDocumento, numeroDocumento, saldoRaw] = tailMatch;

    documents.push({
      erpSource: ErpSource.CEOS,
      clienteId: clientMatch[1],
      tienda: '01',
      tipoDocumento: tipoDocumento.toUpperCase(),
      numeroDocumento: numeroDocumento.toUpperCase(),
      fechaDoc: parseDateDmy(fechaDocRaw),
      valor: parseMoneyToDecimal(saldoRaw),
      saldo: parseMoneyToDecimal(saldoRaw),
      rawRowJson: { sourceFile: 'ERP', raw: line },
    });
  });

  return { documents, errors };
};

const parseTotvsBase = (content: string): ParseResult => {
  const lines = content.split(/\r?\n/);
  const documents: ParsedDocument[] = [];
  const errors: ParserError[] = [];
  let currentClient = '';
  let currentStore = '';

  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    const trimmed = line.trim();
    if (!trimmed) return;

    const clientHeader = trimmed.match(/Cliente\s*:?\s*(\d+)\s*-\s*(\d+)/i);
    if (clientHeader) {
      currentClient = clientHeader[1];
      currentStore = clientHeader[2];
      return;
    }

    if (!trimmed.startsWith(';')) return;
    const parts = line.split(';');
    const token = (parts[1] ?? '').trim();
    if (!token) return;

    if (!currentClient || !currentStore) {
      errors.push({
        sourceFile: 'BASE',
        lineNumber,
        rawLine: line,
        errorCode: 'MISSING_CLIENT_CONTEXT',
        message: 'No se pudo inferir cliente/tienda para línea TOTVS base',
      });
      return;
    }

    const tipoDocumento = buildTotvsTypeFromToken(token);
    const numeroDocumento =
      tipoDocumento === 'RA'
        ? token.replace(/^REC[.\s-]*/i, '').trim()
        : normalizeTotvsDocumentNumber(token);

    const fechaDoc = parseDateDmy(parts[2]);
    const valor = parseMoneyToDecimal(parts[3]);
    const saldo = parseMoneyToDecimal(parts[4]) ?? valor;

    documents.push({
      erpSource: ErpSource.TOTVS,
      clienteId: currentClient,
      tienda: currentStore,
      tipoDocumento,
      numeroDocumento,
      fechaDoc,
      valor,
      saldo,
      rawRowJson: { sourceFile: 'BASE', raw: line },
    });
  });

  return { documents, errors };
};

const parseTotvsIncremental = (content: string): ParseResult => {
  const lines = content.split(/\r?\n/);
  const documents: ParsedDocument[] = [];
  const errors: ParserError[] = [];
  let currentClient = '';
  let currentStore = '';

  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    const trimmed = line.replace(/^"+|"+$/g, '').trim();
    if (!trimmed) return;

    const clientHeader = trimmed.match(/Cliente\s*:?\s*(\d+)\s*-\s*(\d+)/i);
    if (clientHeader) {
      currentClient = clientHeader[1];
      currentStore = clientHeader[2];
      return;
    }

    const docMatch = trimmed.match(
      /^([A-Z]{2,3})\s+([A-Z0-9.-]+)\s+(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+(-?[\d.,]+)\s+(-?[\d.,]+)/i,
    );
    if (!docMatch) return;

    if (!currentClient || !currentStore) {
      errors.push({
        sourceFile: 'ERP',
        lineNumber,
        rawLine: line,
        errorCode: 'MISSING_CLIENT_CONTEXT',
        message: 'No se pudo inferir cliente/tienda para línea TOTVS ERP',
      });
      return;
    }

    const [, tipoDocumento, numeroDocumento, fechaDocRaw, valorRaw, saldoRaw] = docMatch;

    documents.push({
      erpSource: ErpSource.TOTVS,
      clienteId: currentClient,
      tienda: currentStore,
      tipoDocumento: tipoDocumento.toUpperCase(),
      numeroDocumento: numeroDocumento.toUpperCase(),
      fechaDoc: parseDateDmy(fechaDocRaw),
      valor: parseMoneyToDecimal(valorRaw),
      saldo: parseMoneyToDecimal(saldoRaw),
      rawRowJson: { sourceFile: 'ERP', raw: line },
    });
  });

  return { documents, errors };
};

export const buildDocumentKey = (doc: ParsedDocument): string =>
  `${doc.erpSource}|${doc.clienteId}|${doc.tienda}|${doc.tipoDocumento}|${doc.numeroDocumento}`;

export const parseBaseFile = (
  erpSource: ErpSource,
  content: string,
): ParseResult => {
  return erpSource === ErpSource.CEOS
    ? parseCeosBase(content)
    : parseTotvsBase(content);
};

export const parseIncrementalFile = (
  erpSource: ErpSource,
  content: string,
): ParseResult => {
  return erpSource === ErpSource.CEOS
    ? parseCeosIncremental(content)
    : parseTotvsIncremental(content);
};
