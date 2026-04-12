import { IsEnum, Matches } from 'class-validator';
import { ErpSource } from '../entities/consolidation.entity';

export class FullConsolidationFromErpDto {
  @IsEnum(ErpSource)
  erpSource: ErpSource;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fechaCorteEliminacion debe ser YYYY-MM-DD',
  })
  fechaCorteEliminacion: string;
}
