import { Workbook, type Fill, type Worksheet } from 'exceljs';
import { isCeosNrofacValue } from './rendicion-cc-ceos-parser.util';
import type { RendicionRowPaymentColor } from './rendicion-cc-parser.util';
import {
  isComprobanteValue,
  splitCsvLine,
} from './rendicion-cc-parser.util';

const TOTVS_DATA_SHEET_NAME = '01-0107 - Tit por Cob. 2 con S';
const CEOS_DATA_SHEET_NAME = 'FCOB011980';

/** TOTVS: C = Emision / fecha factura. */
const TOTVS_COL_FECHA_FACTURA = 2;
/** TOTVS: B = Comprobante. */
const TOTVS_COL_COMPROBANTE = 1;

/** CEOS: C = fecha. */
const CEOS_COL_FECHA = 2;
/** CEOS: E = nrofac. */
const CEOS_COL_NROFAC = 4;

/** Columna I (1-based) del archivo casa central: estado de pago. */
const EXCEL_COL_ESTADO_PAGO = 9;
/** Columna J (1-based): factura reciente (TOTVS &lt; 30 días / CEOS ≤ 5 días). */
const EXCEL_COL_RECIENTE = 10;
/** Columna K (1-based): sin azul/rojo/amarillo. */
const EXCEL_COL_SIN_MARCA = 11;

/** TOTVS: amarillo si hay menos de 30 días desde la emisión. */
const DIAS_FACTURA_RECIENTE_TOTVS = 30;
/** CEOS: amarillo si la fecha de factura tiene 5 días o menos. */
const DIAS_FACTURA_RECIENTE_CEOS = 5;

/** Mismos tonos que consolidación (`excel-saldo-receipt-fill`). */
const FILL_AZUL_TOTAL: Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF0000FF' },
};
const FILL_ROJO_PARCIAL: Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFA20000' },
};
/** Amarillo para facturas recientes (regla distinta TOTVS/CEOS). */
const FILL_AMARILLO_RECIENTE: Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFF00' },
};
/** Naranja para facturas sin azul, rojo ni amarillo. */
const FILL_NARANJA_SIN_MARCA: Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFA500' },
};

/** Anchos de columna tomados de la planilla TOTVS de rendición. */
const TOTVS_DATA_SHEET_COL_WIDTHS = [
  15.43, 30.43, 19.29, 19.29, 14.86, 14.86, 6.71, 49.29, 11.57, 11.57, 11.57,
  11.57,
];

/** Anchos aproximados planilla CEOS NV (A–H) + I/J/K. */
const CEOS_DATA_SHEET_COL_WIDTHS = [
  10, 40, 12, 8, 12, 14, 14, 40, 11.57, 11.57, 11.57,
];

const CEOS_MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

export const RENDICION_EXCEL_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Parsea fechas típicas TOTVS (d/m/y o d/m/yyyy) a medianoche UTC.
 */
export function parseFechaFacturaDmy(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(trimmed);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (m[3].length === 2) {
    year += year >= 70 ? 1900 : 2000;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return dt;
}

/**
 * Parsea fechas CEOS de casa central (p. ej. `30-Oct-26`).
 */
export function parseFechaFacturaCeos(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/.exec(trimmed);
  if (!m) return null;
  const day = Number(m[1]);
  const month = CEOS_MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  let year = Number(m[3]);
  if (m[3].length === 2) {
    year += year >= 70 ? 1900 : 2000;
  }
  if (day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return dt;
}

function isRecienteDesdeFecha(
  fecha: Date | null,
  today: Date,
  maxDiasInclusive: number,
): boolean {
  if (!fecha) return false;
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const docUtc = Date.UTC(
    fecha.getUTCFullYear(),
    fecha.getUTCMonth(),
    fecha.getUTCDate(),
  );
  const dias = Math.floor((todayUtc - docUtc) / 86400000);
  return dias >= 0 && dias <= maxDiasInclusive;
}

/**
 * True si la factura TOTVS tiene menos de 30 días desde la fecha de emisión (col. C).
 * Equivale a antigüedad 0..29 días.
 */
export function isFacturaRecienteMenorA30Dias(
  fechaEmisionRaw: string,
  today: Date = new Date(),
): boolean {
  return isRecienteDesdeFecha(
    parseFechaFacturaDmy(fechaEmisionRaw),
    today,
    DIAS_FACTURA_RECIENTE_TOTVS - 1,
  );
}

/**
 * True si la factura CEOS tiene 5 días o menos desde la fecha (col. C, `30-Oct-26`).
 */
export function isFacturaRecienteMenorA30DiasCeos(
  fechaEmisionRaw: string,
  today: Date = new Date(),
): boolean {
  return isRecienteDesdeFecha(
    parseFechaFacturaCeos(fechaEmisionRaw),
    today,
    DIAS_FACTURA_RECIENTE_CEOS,
  );
}

function applyIjkColors(
  excelRow: ReturnType<Worksheet['getRow']>,
  opts: {
    esFactura: boolean;
    decision: RendicionRowPaymentColor['decision'] | undefined;
    esReciente: boolean;
  },
): void {
  const { esFactura, decision, esReciente } = opts;
  const tienePagoColor = Boolean(decision);

  if (decision) {
    const cellI = excelRow.getCell(EXCEL_COL_ESTADO_PAGO);
    if (cellI.value == null || cellI.value === '') {
      cellI.value = '';
    }
    cellI.fill = decision === 'azul' ? FILL_AZUL_TOTAL : FILL_ROJO_PARCIAL;
  }

  if (esReciente) {
    const cellJ = excelRow.getCell(EXCEL_COL_RECIENTE);
    if (cellJ.value == null || cellJ.value === '') {
      cellJ.value = '';
    }
    cellJ.fill = FILL_AMARILLO_RECIENTE;
  }

  if (esFactura && !tienePagoColor && !esReciente) {
    const cellK = excelRow.getCell(EXCEL_COL_SIN_MARCA);
    if (cellK.value == null || cellK.value === '') {
      cellK.value = '';
    }
    cellK.fill = FILL_NARANJA_SIN_MARCA;
  }
}

/**
 * Excel TOTVS: Parametros + hoja de datos, colores I/J/K.
 * (Sin cambios de reglas respecto a la versión previa.)
 */
export async function buildRendicionWorkbookBuffer(
  baseCsvText: string,
  rowPaymentColors: RendicionRowPaymentColor[],
  today: Date = new Date(),
): Promise<Buffer> {
  const rows = baseCsvText
    .split(/\r?\n/)
    .filter((line, idx, arr) => !(idx === arr.length - 1 && line === ''))
    .map((line) => splitCsvLine(line));

  const colorByLineIndex = new Map<
    number,
    RendicionRowPaymentColor['decision']
  >();
  for (const item of rowPaymentColors) {
    colorByLineIndex.set(item.lineIndex, item.decision);
  }

  const workbook = new Workbook();

  const parametrosWs = workbook.addWorksheet('Parametros');
  const parametrosAoA = [
    ['Fch.Ref:', ''],
    [''],
    ['Hora:', ''],
    [''],
    ['Emision:', ''],
    [''],
    [''],
    ['Pregunta 01 : Fecha Desde?', ''],
    ['Pregunta 02 : Fecha Hasta?', ''],
    ['Pregunta 03 : Desde Cliente ?', ''],
    ['Pregunta 04 : Hasta Cliente ?', ''],
    ['Pregunta 05 : Ordenamiento ?', ''],
    ['Pregunta 06 : Desde Vendedor ?', ''],
  ];
  for (let r = 0; r < parametrosAoA.length; r += 1) {
    const row = parametrosWs.getRow(r + 1);
    for (let c = 0; c < parametrosAoA[r].length; c += 1) {
      row.getCell(c + 1).value = parametrosAoA[r][c];
    }
  }
  parametrosWs.getColumn(1).width = 75;
  parametrosWs.getColumn(2).width = 40;

  const dataWs = workbook.addWorksheet(TOTVS_DATA_SHEET_NAME);
  for (let r = 0; r < rows.length; r += 1) {
    const cells = rows[r];
    const excelRow = dataWs.getRow(r + 1);
    for (let c = 0; c < cells.length; c += 1) {
      excelRow.getCell(c + 1).value = cells[c];
    }

    const comprobante = cells[TOTVS_COL_COMPROBANTE] ?? '';
    const esFactura = isComprobanteValue(comprobante);
    const decision = colorByLineIndex.get(r);
    const fechaEmision = cells[TOTVS_COL_FECHA_FACTURA] ?? '';
    const esReciente =
      esFactura && isFacturaRecienteMenorA30Dias(fechaEmision, today);

    applyIjkColors(excelRow, { esFactura, decision, esReciente });
  }

  for (let c = 0; c < TOTVS_DATA_SHEET_COL_WIDTHS.length; c += 1) {
    dataWs.getColumn(c + 1).width = TOTVS_DATA_SHEET_COL_WIDTHS[c];
  }
  dataWs.getColumn(EXCEL_COL_ESTADO_PAGO).width =
    TOTVS_DATA_SHEET_COL_WIDTHS[EXCEL_COL_ESTADO_PAGO - 1] ?? 11.57;
  dataWs.getColumn(EXCEL_COL_RECIENTE).width =
    TOTVS_DATA_SHEET_COL_WIDTHS[EXCEL_COL_RECIENTE - 1] ?? 11.57;
  dataWs.getColumn(EXCEL_COL_SIN_MARCA).width =
    TOTVS_DATA_SHEET_COL_WIDTHS[EXCEL_COL_SIN_MARCA - 1] ?? 11.57;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Excel CEOS: una sola hoja (como la planilla NV), colores I/J/K.
 * Fecha reciente lee col. C en formato `30-Oct-26`.
 */
export async function buildRendicionWorkbookBufferCeos(
  baseCsvText: string,
  rowPaymentColors: RendicionRowPaymentColor[],
  today: Date = new Date(),
): Promise<Buffer> {
  const rows = baseCsvText
    .split(/\r?\n/)
    .filter((line, idx, arr) => !(idx === arr.length - 1 && line === ''))
    .map((line) => splitCsvLine(line));

  const colorByLineIndex = new Map<
    number,
    RendicionRowPaymentColor['decision']
  >();
  for (const item of rowPaymentColors) {
    colorByLineIndex.set(item.lineIndex, item.decision);
  }

  const workbook = new Workbook();
  const dataWs = workbook.addWorksheet(CEOS_DATA_SHEET_NAME);

  for (let r = 0; r < rows.length; r += 1) {
    const cells = rows[r];
    const excelRow = dataWs.getRow(r + 1);
    for (let c = 0; c < cells.length; c += 1) {
      excelRow.getCell(c + 1).value = cells[c];
    }

    const nrofac = cells[CEOS_COL_NROFAC] ?? '';
    const esFactura = isCeosNrofacValue(nrofac);
    const decision = colorByLineIndex.get(r);
    const fechaEmision = cells[CEOS_COL_FECHA] ?? '';
    const esReciente =
      esFactura && isFacturaRecienteMenorA30DiasCeos(fechaEmision, today);

    applyIjkColors(excelRow, { esFactura, decision, esReciente });
  }

  for (let c = 0; c < CEOS_DATA_SHEET_COL_WIDTHS.length; c += 1) {
    dataWs.getColumn(c + 1).width = CEOS_DATA_SHEET_COL_WIDTHS[c];
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
