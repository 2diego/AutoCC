import { detectRendicionCasaCentralFormat } from './rendicion-cc-format.util';

describe('detectRendicionCasaCentralFormat', () => {
  it('detecta CEOS NV por nrofac/codcli', () => {
    expect(
      detectRendicionCasaCentralFormat(
        'codcli;desc;fecha;mora;nrofac;importe;saldo;observaciones\n1;a;1;1;6A1;1;1;',
      ),
    ).toBe('CEOS');
  });

  it('detecta TOTVS FC por Comprobante/TC', () => {
    expect(
      detectRendicionCasaCentralFormat(
        'TC;Comprobante;Emision;Venc.Real;Valor;Saldo;Atraso;Observaciones\nNF;A06-1;1;1;1;1;1;',
      ),
    ).toBe('TOTVS');
  });
});
