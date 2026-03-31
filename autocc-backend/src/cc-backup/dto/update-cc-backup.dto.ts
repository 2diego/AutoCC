import { PartialType } from '@nestjs/mapped-types';
import { CreateCcBackupDto } from './create-cc-backup.dto';

export class UpdateCcBackupDto extends PartialType(CreateCcBackupDto) {}
