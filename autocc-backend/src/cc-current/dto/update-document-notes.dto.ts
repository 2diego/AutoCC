import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateDocumentNotesDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  motivoDeuda?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  changedByUserId?: number | null;
}
