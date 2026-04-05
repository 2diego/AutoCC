import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { CcBackupService } from './cc-backup.service';
import { Roles } from '../common/auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('cc-backup')
@Roles(UserRole.ADMIN)
export class CcBackupController {
  constructor(private readonly ccBackupService: CcBackupService) {}

  @Get()
  findAll() {
    return this.ccBackupService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ccBackupService.findOne(id);
  }
}
