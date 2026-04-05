import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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
import { AuthModule } from './auth/auth.module';
import { RolesGuard } from './common/auth/roles.guard';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forRoot(databaseConfig),
    AuthModule,
    UsersModule,
    ConsolidationsModule,
    CcCurrentModule,
    CcBackupModule,
    ConsolidationErrorsModule,
    DocumentNotesAuditModule,
    ExportsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
