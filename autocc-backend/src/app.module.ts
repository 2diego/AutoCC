import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { databaseConfig } from './config/database.config';
import { UsersModule } from './users/users.module';
import { ConsolidationsModule } from './consolidations/consolidations.module';
import { CcCurrentModule } from './cc-current/cc-current.module';
import { CcBackupModule } from './cc-backup/cc-backup.module';
import { ConsolidationErrorsModule } from './consolidation-errors/consolidation-errors.module';
import { DocumentNotesAuditModule } from './document-notes-audit/document-notes-audit.module';
import { ExportsModule } from './exports/exports.module';

@Module({
  imports: [TypeOrmModule.forRoot(databaseConfig), UsersModule, ConsolidationsModule, CcCurrentModule, CcBackupModule, ConsolidationErrorsModule, DocumentNotesAuditModule, ExportsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
