import {
  applyFacturasSamsengToBase,
  buildObservacionesFromFactura,
  computePaymentColorFromFactura,
  isComprobanteValue,
  normalizeComprobanteKey,
} from './rendicion-cc-parser.util';

describe('rendicion-cc-parser.util', () => {
  describe('isComprobanteValue / normalizeComprobanteKey', () => {
    it('acepta comprobantes ERP', () => {
      expect(isComprobanteValue('A06-002200028682')).toBe(true);
      expect(isComprobanteValue('  a01-002100458501  ')).toBe(true);
    });

    it('rechaza encabezados y vacíos', () => {
      expect(isComprobanteValue('')).toBe(false);
      expect(isComprobanteValue('Comprobante')).toBe(false);
      expect(isComprobanteValue('Total Cliente')).toBe(false);
    });

    it('normaliza a mayúsculas sin espacios', () => {
      expect(normalizeComprobanteKey('  a06-002200028682 ')).toBe(
        'A06-002200028682',
      );
    });
  });

  describe('buildObservacionesFromFactura', () => {
    it('arma el texto con recibo y fechas no vacías', () => {
      expect(
        buildObservacionesFromFactura({
          recibo: '136046',
          fechas: ['14/10/2026', '', ''],
          importe: '100',
          saldo: '50',
          importeRecibo: '50',
        }),
      ).toBe('Recibos: 136046 De fecha: 14/10/2026');

      expect(
        buildObservacionesFromFactura({
          recibo: '136464-E/136446',
          fechas: ['20/10/2026', '29/10/2026', ''],
          importe: '100',
          saldo: '50',
          importeRecibo: '50',
        }),
      ).toBe('Recibos: 136464-E/136446 De fecha: 20/10/2026, 29/10/2026');
    });
  });

  describe('computePaymentColorFromFactura', () => {
    it('azul cuando el recibo cubre el importe (o H vacío con G)', () => {
      expect(
        computePaymentColorFromFactura({
          recibo: 'REC-1',
          fechas: [],
          importe: '10.000,00',
          saldo: '10.000,00',
          importeRecibo: '',
        }),
      ).toBe('azul');

      expect(
        computePaymentColorFromFactura({
          recibo: 'REC-1',
          fechas: [],
          importe: '10.000,00',
          saldo: '0',
          importeRecibo: '10.000,00',
        }),
      ).toBe('azul');
    });

    it('rojo cuando el pago es parcial', () => {
      expect(
        computePaymentColorFromFactura({
          recibo: '136046',
          fechas: ['14/10/2026'],
          importe: '2.109.243,07',
          saldo: '1.454.048,07',
          importeRecibo: '655.195,00',
        }),
      ).toBe('rojo');
    });
  });

  describe('applyFacturasSamsengToBase', () => {
    it('escribe columna H y registra color de pago para columna I', () => {
      const base = [
        'TC;Comprobante;Emision;Venc.Real;Valor;Saldo;Atraso;Observaciones',
        'NF;A06-002200028490;29/09/2026;28/10/2026;100;50;19;',
        'NF;A06-002200099999;01/01/2026;01/02/2026;10;10;0;',
        'NF;A06-002200028682;30/10/2026;30/11/2026;10;10;0;',
      ].join('\n');

      const facturas = [
        ' ;Comprobante;Emision;Importe;Saldo;Atraso;Recibo; Importe ;Fecha;Fecha;Fecha',
        ';A06-002200028490;29/9/2026;2.109.243,07;1.454.048,07;51;136046;655.195,00;14/10/2026;;',
        ';A06-002200028682;30/10/2026;10;10;0;;;;;',
      ].join('\n');

      const result = applyFacturasSamsengToBase(base, facturas);

      expect(result.baseDocs).toBe(3);
      expect(result.facturasDocs).toBe(2);
      expect(result.matchedDocs).toBe(2);
      expect(result.updatedRows).toBe(1);
      expect(result.previewMatched).toEqual([
        {
          comprobante: 'A06-002200028490',
          observaciones: 'Recibos: 136046 De fecha: 14/10/2026',
          paymentColor: 'rojo',
        },
      ]);
      expect(result.rowPaymentColors).toEqual([
        {
          lineIndex: 1,
          comprobante: 'A06-002200028490',
          decision: 'rojo',
        },
      ]);

      const lines = result.csvText.split(/\r?\n/);
      expect(lines[1]).toContain(
        ';Recibos: 136046 De fecha: 14/10/2026',
      );
      expect(lines[2]).toBe(
        'NF;A06-002200099999;01/01/2026;01/02/2026;10;10;0;',
      );
      expect(lines[3]).toBe(
        'NF;A06-002200028682;30/10/2026;30/11/2026;10;10;0;',
      );
    });
  });
});
