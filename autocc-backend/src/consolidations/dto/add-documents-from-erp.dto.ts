import { IsEnum } from 'class-validator';
import { ErpSource } from '../entities/consolidation.entity';

export class AddDocumentsFromErpDto {
  @IsEnum(ErpSource)
  erpSource: ErpSource;
}
