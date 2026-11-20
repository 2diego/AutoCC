import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyFacturasSamsengToBaseCeos,
  extractCeosFacturaMatchKey,
  isCeosNrofacValue,
} from './rendicion-cc-ceos-parser.util';

describe('rendicion-cc-ceos-parser.util', () => {
  it('detecta nrofac CEOS', () => {
    expect(isCeosNrofacValue('6A053400')).toBe(true);
    expect(isCeosNrofacValue('nrofac')).toBe(false);
    expect(isCeosNrofacValue('ABELJO SRL')).toBe(false);
  });

  it('extrae clave desde comprobante de planilla NV', () => {
    expect(extractCeosFacturaMatchKey('F 6A053400')).toBe('6A053400');
    expect(extractCeosFacturaMatchKey('D 6B053315')).toBe('6B053315');
    expect(extractCeosFacturaMatchKey('COMPROBANTE')).toBeNull();
  });

  it('escribe observaciones en H al cruzar nrofac con planilla NV', () => {
    const base = [
      'codcli;desc;fecha;mora;nrofac;importe;saldo;observaciones',
      '61896;ABELJO SRL;30-Oct-26;3;6A053400;1185158,72;1185158,72;',
      '30294;ACTUAL;10-Sep-26;53;6A053047;4286301,55;4286301,55;',
      '99999;SIN MATCH;01-Jan-26;1;6A099999;10;10;',
    ].join('\n');

    const facturas = [
      '20/11/2026;COMPROBANTE;FECHA;IMPORTE; SALDO ;ATRASO;RECIBO;IMPORTE;FECHA;FECHA;FECHA',
      ';F 6A053400;30/10/2026;1.185.158,72;1.185.158,72;21;;;;;;;;',
      ';F 6A053047;10/9/2026;;4.286.301,55;;28533;;06/11/2026;;;;;',
    ].join('\n');

    const result = applyFacturasSamsengToBaseCeos(base, facturas);
    expect(result.baseDocs).toBe(3);
    expect(result.matchedDocs).toBe(2);
    // Solo la que tiene recibo/fecha se actualiza
    expect(result.updatedRows).toBe(1);
    expect(result.previewMatched[0]).toEqual({
      comprobante: '6A053047',
      observaciones: 'Recibos: 28533 De fecha: 06/11/2026',
      paymentColor: 'azul', // G con dígitos y H vacío → azul
    });

    const lines = result.csvText.split(/\r?\n/);
    expect(lines[1]).toBe(
      '61896;ABELJO SRL;30-Oct-26;3;6A053400;1185158,72;1185158,72;',
    );
    expect(lines[2]).toContain(
      ';Recibos: 28533 De fecha: 06/11/2026',
    );
  });

  it('cruza ejemplos reales CEOS (planilla limpia + SAMSENG NV)', () => {
    const dir = path.resolve(
      __dirname,
      '../../../EjemplosArchivosERP/RendicionCC',
    );
    const basePath = path.join(
      dir,
      'Planilla rendicion OLAVARRIA NV (16) (1).csv',
    );
    const factPath = path.join(
      dir,
      'SAMSENG NV CUENTA CORRIENTE desde 13-11 hasta 20-11.csv',
    );
    if (!fs.existsSync(basePath) || !fs.existsSync(factPath)) {
      return;
    }

    const decode = (b: Buffer) => {
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(b);
      } catch {
        return new TextDecoder('windows-1252').decode(b);
      }
    };

    const result = applyFacturasSamsengToBaseCeos(
      decode(fs.readFileSync(basePath)),
      decode(fs.readFileSync(factPath)),
    );

    expect(result.baseDocs).toBeGreaterThan(200);
    expect(result.matchedDocs).toBeGreaterThan(100);
    expect(result.updatedRows).toBeGreaterThan(50);
    expect(result.previewMatched.length).toBeGreaterThan(0);
  });
});
