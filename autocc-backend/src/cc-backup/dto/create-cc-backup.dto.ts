export class CreateCcBackupDto {
  erpSource: string;
  clienteId: string;
  tienda: string;
  tipoDocumento: string;
  numeroDocumento: string;
  fechaDoc?: string | null;
  valor?: string | null;
  saldo?: string | null;
  rawRowJson?: Record<string, unknown> | null;
  observaciones?: string | null;
  motivoDeuda?: string | null;
  backupFromConsolidation?: { id: number } | null;
}
