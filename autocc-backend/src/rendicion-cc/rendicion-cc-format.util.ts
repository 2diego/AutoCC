/**
 * Detecta el layout del archivo casa central de rendición por su encabezado.
 * No depende del desplegable ERP (evita procesar NV con lógica FC y viceversa).
 */
export function detectRendicionCasaCentralFormat(
  baseCsvText: string,
): 'CEOS' | 'TOTVS' | null {
  const header = (baseCsvText.split(/\r?\n/)[0] ?? '').trim().toLowerCase();
  if (!header) return null;

  // CEOS NV: codcli;desc;fecha;mora;nrofac;importe;saldo;observaciones
  if (header.includes('nrofac') && header.includes('codcli')) {
    return 'CEOS';
  }

  // TOTVS FC: TC;Comprobante;Emision;...
  if (
    header.includes('comprobante') ||
    /(^|;)\s*tc\s*(;|$)/.test(header) ||
    header.includes('venc.real')
  ) {
    return 'TOTVS';
  }

  return null;
}
