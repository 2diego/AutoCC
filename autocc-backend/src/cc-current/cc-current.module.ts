import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CcCurrentService } from './cc-current.service';
import { CcCurrentController } from './cc-current.controller';
import { CcCurrent } from './entities/cc-current.entity';
import { DocumentNotesAudit } from '../document-notes-audit/entities/document-notes-audit.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CcCurrent, DocumentNotesAudit, User])],
  controllers: [CcCurrentController],
  providers: [CcCurrentService],
  exports: [CcCurrentService],
})
export class CcCurrentModule {}
