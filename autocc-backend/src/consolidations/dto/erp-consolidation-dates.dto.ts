import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  Matches,
} from 'class-validator';
import { ErpSource } from '../entities/consolidation.entity';

/** Fechas declaradas por el usuario al subir base + ERP (YYYY-MM-DD desde input type="date"). */
export class ErpConsolidationDatesDto {
  @IsEnum(ErpSource)
  erpSource: ErpSource;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'baseActualizacionDate debe ser YYYY-MM-DD',
  })
  baseActualizacionDate: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'erpEmisionDate debe ser YYYY-MM-DD',
  })
  erpEmisionDate: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  confirmFileDateMismatch?: boolean;
}
