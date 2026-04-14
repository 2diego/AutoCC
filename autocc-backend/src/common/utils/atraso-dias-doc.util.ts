/**
 * Días transcurridos entre la fecha del documento (emisión) y hoy (UTC medianoche a medianoche).
 * No usa columna Atraso del ERP.
 */
export function atrasoDiasDesdeFechaDocumento(fechaDoc: string | null): number {
  if (fechaDoc == null || String(fechaDoc).trim() === '') return -1;
  const t = String(fechaDoc).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  let docUtc: number;
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const day = Number(m[3]);
    docUtc = Date.UTC(y, mo - 1, day);
  } else {
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return -1;
    docUtc = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
    );
  }
  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.floor((todayUtc - docUtc) / 86400000);
}
