export class CreateConsolidationErrorDto {
  consolidation: { id: number };
  sourceFile: 'BASE' | 'ERP';
  lineNumber: number;
  rawLine: string;
  errorCode: string;
  message: string;
}
