import { Workbook } from 'exceljs';
import { applyFacturasSamsengToBaseCeos } from './rendicion-cc-ceos-parser.util';
import {
  buildRendicionWorkbookBuffer,
  buildRendicionWorkbookBufferCeos,
  isFacturaRecienteMenorA30Dias,
  isFacturaRecienteMenorA30DiasCeos,
  parseFechaFacturaCeos,
  parseFechaFacturaDmy,
} from './rendicion-cc-excel.util';
import { applyFacturasSamsengToBase } from './rendicion-cc-parser.util';

describe('rendicion-cc-excel.util', () => {
  describe('parseFechaFacturaDmy / isFacturaRecienteMenorA30Dias', () => {
    it('parsea d/m/yyyy', () => {
      const d = parseFechaFacturaDmy('05/11/2026');
      expect(d?.getUTCFullYear()).toBe(2026);
      expect(d?.getUTCMonth()).toBe(10);
      expect(d?.getUTCDate()).toBe(5);
    });

    it('marca reciente si hay menos de 30 días', () => {
      const today = new Date(Date.UTC(2026, 10, 20)); // 20/11/2026
      expect(isFacturaRecienteMenorA30Dias('05/11/2026', today)).toBe(true); // 15 días
      expect(isFacturaRecienteMenorA30Dias('22/10/2026', today)).toBe(true); // 29 días
      expect(isFacturaRecienteMenorA30Dias('21/10/2026', today)).toBe(false); // 30 días
      expect(isFacturaRecienteMenorA30Dias('20/10/2026', today)).toBe(false); // 31 días
    });

    it('parsea y marca reciente CEOS (≤ 5 días)', () => {
      const d = parseFechaFacturaCeos('30-Oct-26');
      expect(d?.getUTCFullYear()).toBe(2026);
      expect(d?.getUTCMonth()).toBe(9);
      expect(d?.getUTCDate()).toBe(30);
      const today = new Date(Date.UTC(2026, 10, 20)); // 20/11/2026
      expect(isFacturaRecienteMenorA30DiasCeos('20-Nov-26', today)).toBe(true); // 0 días
      expect(isFacturaRecienteMenorA30DiasCeos('15-Nov-26', today)).toBe(true); // 5 días
      expect(isFacturaRecienteMenorA30DiasCeos('14-Nov-26', today)).toBe(false); // 6 días
      expect(isFacturaRecienteMenorA30DiasCeos('05-Nov-26', today)).toBe(false); // 15 días
    });
  });

  it('genera .xlsx con Parametros + datos y pinta columnas I, J y K', async () => {
    const today = new Date(Date.UTC(2026, 10, 20)); // 20/11/2026
    const base = [
      'TC;Comprobante;Emision;Venc.Real;Valor;Saldo;Atraso;Observaciones',
      'NF;A06-002200028490;05/11/2026;28/11/2026;100;50;19;',
      'NF;A06-TOTAL;01/01/2026;01/02/2026;10;0;0;',
      'NF;A06-SIN-MARCA;01/05/2026;01/06/2026;10;10;0;',
    ].join('\n');
    const facturas = [
      ' ;Comprobante;Emision;Importe;Saldo;Atraso;Recibo; Importe ;Fecha;Fecha;Fecha',
      ';A06-002200028490;05/11/2026;2.109.243,07;1.454.048,07;51;136046;655.195,00;14/10/2026;;',
      ';A06-TOTAL;01/01/2026;10.000,00;0;0;REC-123;;01/02/2026;;',
    ].join('\n');

    const matched = applyFacturasSamsengToBase(base, facturas);
    expect(matched.updatedRows).toBe(2);
    expect(matched.rowPaymentColors.map((c) => c.decision)).toEqual([
      'rojo',
      'azul',
    ]);

    const buffer = await buildRendicionWorkbookBuffer(
      matched.csvText,
      matched.rowPaymentColors,
      today,
    );
    expect(buffer.length).toBeGreaterThan(500);

    const wb = new Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual([
      'Parametros',
      '01-0107 - Tit por Cob. 2 con S',
    ]);

    const dataWs = wb.getWorksheet('01-0107 - Tit por Cob. 2 con S');
    expect(dataWs).toBeDefined();

    const cellRojo = dataWs!.getRow(2).getCell(9);
    const fillRojo = cellRojo.fill as { fgColor?: { argb?: string } };
    expect(fillRojo?.fgColor?.argb).toBe('FFA20000');

    const cellAzul = dataWs!.getRow(3).getCell(9);
    const fillAzul = cellAzul.fill as { fgColor?: { argb?: string } };
    expect(fillAzul?.fgColor?.argb).toBe('FF0000FF');

    const cellJReciente = dataWs!.getRow(2).getCell(10);
    const fillJ = cellJReciente.fill as { fgColor?: { argb?: string } };
    expect(fillJ?.fgColor?.argb).toBe('FFFFFF00');

    const cellJVieja = dataWs!.getRow(3).getCell(10);
    expect(cellJVieja.fill).toBeUndefined();

    // Sin azul/rojo/amarillo → K naranja
    const cellKSinMarca = dataWs!.getRow(4).getCell(11);
    const fillK = cellKSinMarca.fill as { fgColor?: { argb?: string } };
    expect(fillK?.fgColor?.argb).toBe('FFFFA500');

    // Filas con I o J no llevan naranja en K
    expect(dataWs!.getRow(2).getCell(11).fill).toBeUndefined();
    expect(dataWs!.getRow(3).getCell(11).fill).toBeUndefined();
  });

  it('Excel CEOS: hoja única y colores I/J/K (amarillo ≤ 5 días)', async () => {
    const today = new Date(Date.UTC(2026, 10, 20));
    const base = [
      'codcli;desc;fecha;mora;nrofac;importe;saldo;observaciones',
      '1;A;18-Nov-26;1;6A053047;100;50;',
      '2;B;01-Jan-26;1;6A053400;10;10;',
      '3;C;01-May-26;1;6A099999;10;10;',
    ].join('\n');
    const facturas = [
      ';COMPROBANTE;FECHA;IMPORTE;SALDO;ATRASO;RECIBO;IMPORTE;FECHA',
      ';F 6A053047;18/11/2026;100;50;1;28533;;06/11/2026',
      ';F 6A053400;01/01/2026;10;10;1;REC-123;;01/02/2026',
    ].join('\n');

    const matched = applyFacturasSamsengToBaseCeos(base, facturas);
    const buffer = await buildRendicionWorkbookBufferCeos(
      matched.csvText,
      matched.rowPaymentColors,
      today,
    );
    const wb = new Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(['FCOB011980']);

    const ws = wb.getWorksheet('FCOB011980')!;
    // fila 2: 2 días + pago azul → I azul, J amarillo, sin K
    expect(
      (ws.getRow(2).getCell(9).fill as { fgColor?: { argb?: string } })
        ?.fgColor?.argb,
    ).toBe('FF0000FF');
    expect(
      (ws.getRow(2).getCell(10).fill as { fgColor?: { argb?: string } })
        ?.fgColor?.argb,
    ).toBe('FFFFFF00');
    expect(ws.getRow(2).getCell(11).fill).toBeUndefined();

    // fila 4: sin marca → K naranja
    expect(
      (ws.getRow(4).getCell(11).fill as { fgColor?: { argb?: string } })
        ?.fgColor?.argb,
    ).toBe('FFFFA500');
  });
});
