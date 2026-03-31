import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CcCurrent } from '../cc-current/entities/cc-current.entity';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

@Module({
  imports: [TypeOrmModule.forFeature([CcCurrent])],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
