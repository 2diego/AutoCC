import { PartialType } from '@nestjs/mapped-types';
import { CreateCcCurrentDto } from './create-cc-current.dto';

export class UpdateCcCurrentDto extends PartialType(CreateCcCurrentDto) {}
