import { IsEnum } from 'class-validator';
import { ErpSource } from '../../consolidations/entities/consolidation.entity';

export class FacturasSamsengDto {
  @IsEnum(ErpSource)
  erpSource: ErpSource;
}
