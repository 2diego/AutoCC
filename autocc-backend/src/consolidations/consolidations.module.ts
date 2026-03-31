import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsolidationsService } from './consolidations.service';
import { ConsolidationsController } from './consolidations.controller';
import { Consolidation } from './entities/consolidation.entity';
import { CcCurrent } from '../cc-current/entities/cc-current.entity';
import { CcBackup } from '../cc-backup/entities/cc-backup.entity';
import { ConsolidationError } from '../consolidation-errors/entities/consolidation-error.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Consolidation,
      CcCurrent,
      CcBackup,
      ConsolidationError,
    ]),
  ],
  controllers: [ConsolidationsController],
  providers: [ConsolidationsService],
  exports: [ConsolidationsService],
})
export class ConsolidationsModule {}
