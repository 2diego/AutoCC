import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ConsolidationErrorsService } from './consolidation-errors.service';
import { Roles } from '../common/auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('consolidation-errors')
@Roles(UserRole.ADMIN)
export class ConsolidationErrorsController {
  constructor(
    private readonly consolidationErrorsService: ConsolidationErrorsService,
  ) {}

  @Get()
  findAll() {
    return this.consolidationErrorsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.consolidationErrorsService.findOne(id);
  }
}
