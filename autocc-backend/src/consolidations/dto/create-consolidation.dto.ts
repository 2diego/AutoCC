import {
  ConsolidationStatus,
  ErpSource,
} from '../entities/consolidation.entity';

export class CreateConsolidationDto {
  erpSource: ErpSource;
  baseFileName: string;
  erpFileName: string;
  status?: ConsolidationStatus;
  baseDocsCount?: number;
  erpDocsCount?: number;
  addedDocsCount?: number;
  keptDocsCount?: number;
  errorCount?: number;
}
