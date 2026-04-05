import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CcCurrent } from '../cc-current/entities/cc-current.entity';
import { Consolidation } from '../consolidations/entities/consolidation.entity';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

@Module({
  imports: [TypeOrmModule.forFeature([CcCurrent, Consolidation])],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
