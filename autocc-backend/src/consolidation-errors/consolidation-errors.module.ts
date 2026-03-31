import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsolidationErrorsService } from './consolidation-errors.service';
import { ConsolidationErrorsController } from './consolidation-errors.controller';
import { ConsolidationError } from './entities/consolidation-error.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ConsolidationError])],
  controllers: [ConsolidationErrorsController],
  providers: [ConsolidationErrorsService],
})
export class ConsolidationErrorsModule {}
