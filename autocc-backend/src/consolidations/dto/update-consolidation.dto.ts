import { PartialType } from '@nestjs/mapped-types';
import { CreateConsolidationDto } from './create-consolidation.dto';

export class UpdateConsolidationDto extends PartialType(
  CreateConsolidationDto,
) {}
