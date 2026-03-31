import { PartialType } from '@nestjs/mapped-types';
import { CreateConsolidationErrorDto } from './create-consolidation-error.dto';

export class UpdateConsolidationErrorDto extends PartialType(CreateConsolidationErrorDto) {}
