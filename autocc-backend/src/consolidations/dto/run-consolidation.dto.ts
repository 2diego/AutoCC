import { IsEnum } from 'class-validator';
import { ErpSource } from '../entities/consolidation.entity';

export class RunConsolidationDto {
  @IsEnum(ErpSource)
  erpSource: ErpSource;
}
