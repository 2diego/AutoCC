import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentNotesAuditService } from './document-notes-audit.service';
import { DocumentNotesAuditController } from './document-notes-audit.controller';
import { DocumentNotesAudit } from './entities/document-notes-audit.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentNotesAudit])],
  controllers: [DocumentNotesAuditController],
  providers: [DocumentNotesAuditService],
})
export class DocumentNotesAuditModule {}
