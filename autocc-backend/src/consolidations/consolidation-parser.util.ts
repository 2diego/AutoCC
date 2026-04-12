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

/** Soporta CRLF, LF y CR (algunos exports legacy usan solo CR). */
const LINE_SPLIT_REGEX = /\r\n|\n|\r/;

/** Normaliza separadores: recorta y colapsa espacios alrededor de `/`. */
export const normalizeDmYDateToken = (raw: string): string =>
  raw.trim().replace(/\s*\/\s*/g, '/');

/**
 * Indica si el texto encaja en la forma día/mes/año (d y m: 1–2 cifras; año: 2 o 4 cifras).
 * No garantiza que sea una fecha de calendario válida.
 */
export const documentDateMatchesDmYPattern = (raw: string): boolean => {
  const n = normalizeDmYDateToken(raw);
  return /^\d{1,2}\/\d{1,2}\/(\d{2}|\d{4})$/.test(n);
};

/**
 * Parsea fecha en orden **día / mes / año** (regla de negocio).
 * - Día y mes: 1 o 2 dígitos (sin ceros obligatorios).
 * - Año: 2 dígitos (se interpreta como 20xx) o 4 dígitos.
 * - Espacios opcionales alrededor de las barras.
 */
export function parseDocumentDateDmY(raw?: string | null): Date | null {
  if (raw == null) return null;
  const n = normalizeDmYDateToken(raw);
  const match = n.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const yStr = match[3];
  const year = yStr.length === 2 ? 2000 + Number(yStr) : Number(yStr);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/** @deprecated Usar parseDocumentDateDmY (soporta además año de 2 cifras). */
export const parseDocumentDateDdMmYyyy = parseDocumentDateDmY;

type DateFieldCheck =
  | { date: Date; error?: undefined }
  | { date: null; error: ParserError };

/**
 * Valida un campo donde se espera d/m/y. Si falta o no cumple, devuelve error para registrar alerta.
 */
function checkExpectedDocumentDateField(
  raw: string | undefined,
  fieldLabel: string,
  lineNumber: number,
  rawLine: string,
  sourceFile: 'BASE' | 'ERP',
): DateFieldCheck {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return {
      date: null,
      error: {
        sourceFile,
        lineNumber,
        rawLine,
        errorCode: 'MISSING_DOCUMENT_DATE',
        message: `Falta la fecha (${fieldLabel}). Regla: día/mes/año, con 1–2 cifras en día y mes y año de 2 o 4 cifras.`,
      },
    };
  }
  const date = parseDocumentDateDmY(trimmed);
  if (date) {
    return { date };
  }
  const patternOk = documentDateMatchesDmYPattern(trimmed);
  return {
    date: null,
    error: {
      sourceFile,
      lineNumber,
      rawLine,
      errorCode: patternOk
        ? 'INVALID_DOCUMENT_DATE_CALENDAR'
        : 'INVALID_DOCUMENT_DATE_FORMAT',
      message: patternOk
        ? `La fecha "${trimmed}" (${fieldLabel}) no es válida en el calendario.`
        : `La fecha "${trimmed}" (${fieldLabel}) no cumple el formato día/mes/año (d y m: 1–2 cifras; año: 2 o 4 cifras; orden día/mes/año).`,
    },
  };
}

const parseMoneyToDecimal = (raw?: string): string | null => {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/\uFFFD/g, '')
    .replaceAll('\u0000', '')
    .replace(/[^\d,.-]/g, '');
  if (!cleaned) return null;
  try {
    const parsed = parseMoneyERP(cleaned);
    return parsed.toFixed(2);
  } catch {
    return null;
  }
};

const stripWrappingQuotes = (value: string): string =>
  value.replace(/^"+|"+$/g, '').trim();

const splitCsvCommaAware = (line: string): string[] => {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((v) => stripWrappingQuotes(v));
};

const splitBaseColumns = (line: string): string[] => {
  if (line.includes(';')) {
    return line.split(';').map((v) => stripWrappingQuotes(v));
  }
  if (line.includes(',')) {
    return splitCsvCommaAware(line);
  }
  return [stripWrappingQuotes(line)];
};

const joinBaseColumnsForHeader = (line: string): string =>
  splitBaseColumns(line)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ');

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
  // TOTVS: serie AC (p. ej. AC1-002100029354) es nota de crédito
  if (/^AC\d+-/i.test(t)) return 'NCC';
  // TOTVS: serie AD (p. ej. AD4-001400000862) es nota de débito
  if (/^AD\d+-/i.test(t)) return 'ND';
  if (t.startsWith('RA')) return 'RA';
  return 'NF';
};

const normalizeTotvsDocumentNumber = (token: string): string => token.trim();
const canonicalizeTotvsNumeroForKey = (numeroDocumento: string): string => {
  const t = numeroDocumento.trim().toUpperCase();
  const m = t.match(/^([A-Z]\d{2}-)(\d+)$/);
  if (!m) return t;
  const [, prefix, digits] = m;
  const normalizedDigits = digits.replace(/^0+/, '') || '0';
  return `${prefix}${normalizedDigits}`;
};
const hasAnyDigit = (value: string): boolean => /\d/.test(value);
const isLikelyTotvsDocToken = (token: string): boolean =>
  /^(REC[.\s-]*\d+|RA[.\s-]*\d+|NF[.\s-]*\S*\d+|NCE[.\s-]*\S*\d+|NCC[.\s-]*\S*\d+|YD1[.\s-]*\S*\d+|AC\d+-\S*\d+|AD\d+-\S*\d+|[A-Z]\d{2}-\S*\d+|D\s+\S*\d+)/i.test(
    token.trim(),
  );

const normalizeCeosDocument = (
  token: string,
): { tipoDocumento: string; numeroDocumento: string } | null => {
  const t = token.trim().toUpperCase();
  if (!t) return null;

  if (t.startsWith('REC')) {
    const numero = t.replace(/^REC[.\s-]*/i, '').trim();
    if (!hasAnyDigit(numero)) return null;
    return {
      tipoDocumento: 'R',
      numeroDocumento: numero,
    };
  }

  const match = t.match(/^([FCDR])(?:\s+|[.-])([A-Z0-9.-]+)$/);
  if (!match) return null;
  const [, tipo, numero] = match;
  if (!hasAnyDigit(numero)) return null;
  return { tipoDocumento: tipo, numeroDocumento: (numero ?? '').trim() };
};

const parseCeosBase = (content: string): ParseResult => {
  const lines = content.split(LINE_SPLIT_REGEX);
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

    const parts = splitBaseColumns(line);
    const headerText = parts.join(' ');
    const clientHeader = extractClientAndStore(headerText || trimmed);
    if (clientHeader) {
      currentClient = clientHeader.clienteId;
      currentStore = clientHeader.tienda ?? '01';
      currentClientName = extractClientName(headerText || trimmed);
      currentLocalidad = extractLocalidadFromSemicolon(parts.join(';'));
      return;
    }

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

    const fechaCheck = checkExpectedDocumentDateField(
      parts[2],
      'fecha del comprobante (columna de fecha en base CEOS)',
      lineNumber,
      line,
      'BASE',
    );
    if (fechaCheck.error) {
      errors.push(fechaCheck.error);
      return;
    }
    const fechaDoc = fechaCheck.date;
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
  const firstDateIdx = afterId.search(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
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
  const lines = content.split(LINE_SPLIT_REGEX);
  const documents: ParsedDocument[] = [];
  const errors: ParserError[] = [];

  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    const trimmed = line.replace(/^"+|"+$/g, '').trim();
    if (!trimmed) return;

    const tailMatch = trimmed.match(
      /(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+\d+\s+([FCDR])\s+([A-Z0-9.-]+)\s+(-?[\d.,]+)\s*$/i,
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

    const [
      ,
      fechaDocRaw,
      fechaVtoRaw,
      tipoDocumento,
      numeroDocumento,
      saldoRaw,
    ] = tailMatch;

    const emisionCheck = checkExpectedDocumentDateField(
      fechaDocRaw,
      'fecha de emisión del comprobante (listado ERP CEOS)',
      lineNumber,
      line,
      'ERP',
    );
    if (emisionCheck.error) {
      errors.push(emisionCheck.error);
      return;
    }

    const vtoCheck = checkExpectedDocumentDateField(
      fechaVtoRaw,
      'fecha de vencimiento (listado ERP CEOS)',
      lineNumber,
      line,
      'ERP',
    );
    if (vtoCheck.error) {
      errors.push(vtoCheck.error);
      return;
    }

    const ceosErpMeta = extractCeosErpLineMeta(trimmed);

    documents.push({
      erpSource: ErpSource.CEOS,
      clienteId: clientMatch[1],
      tienda: '01',
      tipoDocumento: tipoDocumento.toUpperCase(),
      numeroDocumento: numeroDocumento.toUpperCase(),
      fechaDoc: emisionCheck.date,
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
  const lines = content.split(LINE_SPLIT_REGEX);
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

    const parts = splitBaseColumns(line);
    const headerText = parts.join(' ');
    const clientHeader = extractClientAndStore(headerText || trimmed);
    if (clientHeader) {
      currentClient = clientHeader.clienteId;
      currentStore = clientHeader.tienda ?? currentStore;
      currentClientName = extractClientName(headerText || trimmed);
      currentLocalidad = extractLocalidadFromSemicolon(parts.join(';'));
      return;
    }

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

    const fechaCheck = checkExpectedDocumentDateField(
      parts[2],
      'fecha del comprobante (columna de fecha en base TOTVS)',
      lineNumber,
      line,
      'BASE',
    );
    if (fechaCheck.error) {
      errors.push(fechaCheck.error);
      return;
    }
    const fechaDoc = fechaCheck.date;
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
        fechaDocRaw: parts[2] ?? undefined,
        nombreCliente: currentClientName || undefined,
        localidad: currentLocalidad || undefined,
      },
    });
  });

  return { documents, errors };
};

const parseTotvsIncremental = (content: string): ParseResult => {
  const lines = content.split(LINE_SPLIT_REGEX);
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
      /^([A-Z]{2,3})\s+([A-Z0-9.-]+)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(-?[\d.,]+)\s+(-?[\d.,]+)/i,
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

    const [
      ,
      tipoColumna,
      numeroDocumento,
      fechaDocRaw,
      fechaVtoRaw,
      valorRaw,
      saldoRaw,
    ] = docMatch;

    const inferredTipo = buildTotvsTypeFromToken(numeroDocumento);
    const tipoDocumento =
      inferredTipo !== 'NF' ? inferredTipo : tipoColumna.toUpperCase();

    const emisionCheck = checkExpectedDocumentDateField(
      fechaDocRaw,
      'fecha de emisión del comprobante (listado ERP TOTVS)',
      lineNumber,
      line,
      'ERP',
    );
    if (emisionCheck.error) {
      errors.push(emisionCheck.error);
      return;
    }

    const vtoCheck = checkExpectedDocumentDateField(
      fechaVtoRaw,
      'fecha de vencimiento (listado ERP TOTVS)',
      lineNumber,
      line,
      'ERP',
    );
    if (vtoCheck.error) {
      errors.push(vtoCheck.error);
      return;
    }

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
      fechaDoc: emisionCheck.date,
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
): string => {
  const numeroForKey =
    erpSource === ErpSource.TOTVS
      ? canonicalizeTotvsNumeroForKey(numeroDocumento)
      : numeroDocumento;
  return `${erpSource}|${clienteId}|${tienda}|${tipoDocumento}|${numeroForKey}`;
};

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
  const headerText = joinBaseColumnsForHeader(line);
  const clientHeader = extractClientAndStore(headerText || trimmed);
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
  const parts = splitBaseColumns(line);
  if (parts.length <= 1) {
    return { kind: 'other', next: { ...state } };
  }
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
  const headerText = joinBaseColumnsForHeader(line);
  const clientHeader = extractClientAndStore(headerText || trimmed);
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
  const parts = splitBaseColumns(line);
  if (parts.length <= 1) {
    return { kind: 'other', next: { ...state } };
  }
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

function parseIncrementalListingInternal(
  erpSource: ErpSource,
  content: string,
): ParseResult {
  return erpSource === ErpSource.CEOS
    ? parseCeosIncremental(content)
    : parseTotvsIncremental(content);
}

/** Listado incremental CEOS/TOTVS: documentos del ERP (mismo formato para agregar o para cruzar con el base al eliminar). */
export const parseErpListingForDocumentAdd = parseIncrementalListingInternal;

export const parseErpListingForDocumentRemoval =
  parseIncrementalListingInternal;
