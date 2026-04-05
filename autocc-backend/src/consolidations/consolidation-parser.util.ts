import { parseMoneyERP } from '../common/utils/parse-money-erp.util';
import { ErpSource } from './entities/consolidation.entity';

export type ParsedDocument = {
  erpSource: ErpSource;
  clienteId: string;
  tienda: string;
  clienteNombre?: string;
  localidad?: string;
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
  try {
    const parsed = parseMoneyERP(cleaned);
    return parsed.toFixed(2);
  } catch {
    return null;
  }
};

export const extractClientAndStore = (
  line: string,
): { clienteId: string; tienda: string | null } | null => {
  const normalized = line.replace(/\u2013|\u2014/g, '-');
  const match = normalized.match(/cliente[^0-9]*(\d{2,})\s*-\s*(\d{1,2})/i);
  if (match) {
    return { clienteId: match[1], tienda: match[2] };
  }

  const clientOnly = normalized.match(/cliente[^0-9]*(\d{2,})/i);
  if (clientOnly) {
    return { clienteId: clientOnly[1], tienda: null };
  }

  return null;
};

const extractLocalidadFromSemicolon = (line: string): string => {
  const parts = line
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return '';
  const candidate = parts[parts.length - 1];
  if (/^cliente/i.test(candidate)) return '';
  return candidate;
};

const extractClientName = (line: string): string => {
  const normalized = line.replace(/\u2013|\u2014/g, '-');
  const nameMatch = normalized.match(/cliente[^-]*-\s*\d{1,2}\s*-\s*([^;]+)/i);
  return nameMatch?.[1]?.trim() ?? '';
};

const extractDocTokenFromParts = <T>(
  parts: string[],
  normalizer: (value: string) => T | null | undefined,
): string | null => {
  const candidates = [parts[1], parts[0], parts[2]]
    .map((value) => (value ?? '').trim())
    .filter((value) => value.length > 0);
  const token = candidates.find((value) => normalizer(value));
  return token ?? null;
};

const buildTotvsTypeFromToken = (token: string): string => {
  const t = token.trim().toUpperCase();
  if (t.startsWith('REC')) return 'RA';
  if (t.startsWith('YD1')) return 'NCE';
  if (t.startsWith('D ')) return 'NCE';
  if (t.startsWith('NCE')) return 'NCE';
  if (t.startsWith('NCC')) return 'NCC';
  if (t.startsWith('RA')) return 'RA';
  return 'NF';
};

const normalizeTotvsDocumentNumber = (token: string): string => token.trim();
const isLikelyTotvsDocToken = (token: string): boolean =>
  /^(REC\.?|RA|NF|NCE|NCC|YD1|[A-Z]\d{2}-|D\s+\d)/i.test(token.trim());

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
  let currentClientName = '';
  let currentLocalidad = '';

  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    const trimmed = line.trim();
    if (!trimmed) return;

    const clientHeader = extractClientAndStore(trimmed);
    if (clientHeader) {
      currentClient = clientHeader.clienteId;
      currentStore = clientHeader.tienda ?? '01';
      currentClientName = extractClientName(trimmed);
      currentLocalidad = extractLocalidadFromSemicolon(line);
      return;
    }

    if (!line.includes(';')) return;
    const parts = line.split(';');
    const docToken = extractDocTokenFromParts(parts, normalizeCeosDocument);
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
      clienteNombre: currentClientName || undefined,
      localidad: currentLocalidad || undefined,
      tipoDocumento: normalized.tipoDocumento,
      numeroDocumento: normalized.numeroDocumento,
      fechaDoc,
      valor,
      saldo,
      rawRowJson: {
        sourceFile: 'BASE',
        raw: line,
        nombreCliente: currentClientName || undefined,
        localidad: currentLocalidad || undefined,
      },
    });
  });

  return { documents, errors };
};

/** Heurística para listados CEOS ERP (columnas separadas por espacios múltiples). */
const extractCeosErpLineMeta = (
  trimmed: string,
): { nombreCliente?: string; localidad?: string } => {
  const idMatch = trimmed.match(/^(\d+)\s+/);
  if (!idMatch) return {};
  const afterId = trimmed.slice(idMatch[0].length);
  const firstDateIdx = afterId.search(/\d{2}\/\d{2}\/\d{4}/);
  const preamble =
    firstDateIdx >= 0 ? afterId.slice(0, firstDateIdx).trim() : afterId.trim();
  if (!preamble) return {};
  const chunks = preamble
    .split(/\s{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (chunks.length === 0) return {};
  const nombreCliente = chunks[0];
  const localidad =
    chunks.length >= 3
      ? chunks[2]
      : chunks.length === 2
        ? chunks[1]
        : undefined;
  return { nombreCliente, localidad };
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

    const [, fechaDocRaw, , tipoDocumento, numeroDocumento, saldoRaw] =
      tailMatch;

    const ceosErpMeta = extractCeosErpLineMeta(trimmed);

    documents.push({
      erpSource: ErpSource.CEOS,
      clienteId: clientMatch[1],
      tienda: '01',
      tipoDocumento: tipoDocumento.toUpperCase(),
      numeroDocumento: numeroDocumento.toUpperCase(),
      fechaDoc: parseDateDmy(fechaDocRaw),
      valor: parseMoneyToDecimal(saldoRaw),
      saldo: parseMoneyToDecimal(saldoRaw),
      clienteNombre: ceosErpMeta.nombreCliente,
      localidad: ceosErpMeta.localidad,
      rawRowJson: {
        sourceFile: 'ERP',
        raw: line,
        nombreCliente: ceosErpMeta.nombreCliente,
        localidad: ceosErpMeta.localidad,
      },
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
  let currentClientName = '';
  let currentLocalidad = '';

  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    const trimmed = line.trim();
    if (!trimmed) return;

    const clientHeader = extractClientAndStore(trimmed);
    if (clientHeader) {
      currentClient = clientHeader.clienteId;
      currentStore = clientHeader.tienda ?? currentStore;
      currentClientName = extractClientName(trimmed);
      currentLocalidad = extractLocalidadFromSemicolon(line);
      return;
    }

    if (!line.includes(';')) return;
    const parts = line.split(';');
    const token = extractDocTokenFromParts(parts, (candidate) =>
      isLikelyTotvsDocToken(candidate) ? candidate : null,
    );
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
      clienteNombre: currentClientName || undefined,
      localidad: currentLocalidad || undefined,
      tipoDocumento,
      numeroDocumento,
      fechaDoc,
      valor,
      saldo,
      rawRowJson: {
        sourceFile: 'BASE',
        raw: line,
        nombreCliente: currentClientName || undefined,
        localidad: currentLocalidad || undefined,
      },
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
  let currentClientName = '';
  let currentLocalidad = '';

  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    const trimmed = line.replace(/^"+|"+$/g, '').trim();
    if (!trimmed) return;

    const clientHeader = extractClientAndStore(trimmed);
    if (clientHeader) {
      currentClient = clientHeader.clienteId;
      currentStore = clientHeader.tienda ?? currentStore;
      currentClientName = extractClientName(trimmed);
      currentLocalidad = extractLocalidadFromSemicolon(line);
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

    const [, tipoDocumento, numeroDocumento, fechaDocRaw, valorRaw, saldoRaw] =
      docMatch;

    const diasAtrasoMatch = trimmed.match(/\s(-?\d{1,4})\s*$/);
    const diasAtraso = diasAtrasoMatch?.[1];

    documents.push({
      erpSource: ErpSource.TOTVS,
      clienteId: currentClient,
      tienda: currentStore,
      clienteNombre: currentClientName || undefined,
      localidad: currentLocalidad || undefined,
      tipoDocumento: tipoDocumento.toUpperCase(),
      numeroDocumento: numeroDocumento.toUpperCase(),
      fechaDoc: parseDateDmy(fechaDocRaw),
      valor: parseMoneyToDecimal(valorRaw),
      saldo: parseMoneyToDecimal(saldoRaw),
      rawRowJson: {
        sourceFile: 'ERP',
        raw: line,
        nombreCliente: currentClientName || undefined,
        localidad: currentLocalidad || undefined,
        ...(diasAtraso !== undefined ? { diasAtraso } : {}),
      },
    });
  });

  return { documents, errors };
};

export const buildDocumentKeyFromParts = (
  erpSource: ErpSource,
  clienteId: string,
  tienda: string,
  tipoDocumento: string,
  numeroDocumento: string,
): string =>
  `${erpSource}|${clienteId}|${tienda}|${tipoDocumento}|${numeroDocumento}`;

export const buildDocumentKey = (doc: ParsedDocument): string =>
  buildDocumentKeyFromParts(
    doc.erpSource,
    doc.clienteId,
    doc.tienda,
    doc.tipoDocumento,
    doc.numeroDocumento,
  );

export type CeosReplayState = { currentClient: string; currentStore: string };

export type TotvsReplayState = { currentClient: string; currentStore: string };

export type CeosBaseStepResult =
  | { kind: 'empty'; next: CeosReplayState }
  | { kind: 'header'; clientKey: string; next: CeosReplayState }
  | { kind: 'doc'; docKey: string; next: CeosReplayState }
  | { kind: 'other'; next: CeosReplayState };

export type TotvsBaseStepResult =
  | { kind: 'empty'; next: TotvsReplayState }
  | { kind: 'header'; clientKey: string; next: TotvsReplayState }
  | { kind: 'doc'; docKey: string; next: TotvsReplayState }
  | { kind: 'other'; next: TotvsReplayState };

export const initialCeosReplayState = (): CeosReplayState => ({
  currentClient: '',
  currentStore: '01',
});

export const initialTotvsReplayState = (): TotvsReplayState => ({
  currentClient: '',
  currentStore: '',
});

export function stepCeosBaseLine(
  line: string,
  state: CeosReplayState,
): CeosBaseStepResult {
  const trimmed = line.trim();
  if (!trimmed) {
    return { kind: 'empty', next: { ...state } };
  }
  const clientHeader = extractClientAndStore(trimmed);
  if (clientHeader) {
    const next: CeosReplayState = {
      currentClient: clientHeader.clienteId,
      currentStore: clientHeader.tienda ?? '01',
    };
    return {
      kind: 'header',
      clientKey: `${next.currentClient}|${next.currentStore}`,
      next,
    };
  }
  if (!line.includes(';')) {
    return { kind: 'other', next: { ...state } };
  }
  const parts = line.split(';');
  const docToken = extractDocTokenFromParts(parts, normalizeCeosDocument);
  if (!docToken) {
    return { kind: 'other', next: { ...state } };
  }
  const normalized = normalizeCeosDocument(docToken);
  if (!normalized || !normalized.numeroDocumento) {
    return { kind: 'other', next: { ...state } };
  }
  if (!state.currentClient) {
    return { kind: 'other', next: { ...state } };
  }
  const docKey = buildDocumentKeyFromParts(
    ErpSource.CEOS,
    state.currentClient,
    state.currentStore,
    normalized.tipoDocumento,
    normalized.numeroDocumento,
  );
  return { kind: 'doc', docKey, next: { ...state } };
}

export function stepTotvsBaseLine(
  line: string,
  state: TotvsReplayState,
): TotvsBaseStepResult {
  const trimmed = line.trim();
  if (!trimmed) {
    return { kind: 'empty', next: { ...state } };
  }
  const clientHeader = extractClientAndStore(trimmed);
  if (clientHeader) {
    const next: TotvsReplayState = {
      currentClient: clientHeader.clienteId,
      currentStore: clientHeader.tienda ?? state.currentStore,
    };
    return {
      kind: 'header',
      clientKey: `${next.currentClient}|${next.currentStore}`,
      next,
    };
  }
  if (!line.includes(';')) {
    return { kind: 'other', next: { ...state } };
  }
  const parts = line.split(';');
  const token = extractDocTokenFromParts(parts, (candidate) =>
    isLikelyTotvsDocToken(candidate) ? candidate : null,
  );
  if (!token) {
    return { kind: 'other', next: { ...state } };
  }
  if (!state.currentClient || !state.currentStore) {
    return { kind: 'other', next: { ...state } };
  }
  const tipoDocumento = buildTotvsTypeFromToken(token);
  const numeroDocumento =
    tipoDocumento === 'RA'
      ? token.replace(/^REC[.\s-]*/i, '').trim()
      : normalizeTotvsDocumentNumber(token);
  const docKey = buildDocumentKeyFromParts(
    ErpSource.TOTVS,
    state.currentClient,
    state.currentStore,
    tipoDocumento,
    numeroDocumento,
  );
  return { kind: 'doc', docKey, next: { ...state } };
}

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
