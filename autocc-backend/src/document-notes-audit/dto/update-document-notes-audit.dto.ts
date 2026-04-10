import { PartialType } from '@nestjs/mapped-types';
import { CreateDocumentNotesAuditDto } from './create-document-notes-audit.dto';

export class UpdateDocumentNotesAuditDto extends PartialType(
  CreateDocumentNotesAuditDto,
) {}
