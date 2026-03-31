export class CreateDocumentNotesAuditDto {
  erpSource: string;
  documentKey: string;
  oldObservaciones?: string | null;
  newObservaciones?: string | null;
  oldMotivoDeuda?: string | null;
  newMotivoDeuda?: string | null;
  changedByUser?: { id: number } | null;
}
