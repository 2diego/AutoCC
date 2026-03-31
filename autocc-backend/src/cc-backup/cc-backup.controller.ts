import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { CcBackupService } from './cc-backup.service';
import { CreateCcBackupDto } from './dto/create-cc-backup.dto';
import { UpdateCcBackupDto } from './dto/update-cc-backup.dto';

@Controller('cc-backup')
export class CcBackupController {
  constructor(private readonly ccBackupService: CcBackupService) {}

  @Post()
  create(@Body() createCcBackupDto: CreateCcBackupDto) {
    return this.ccBackupService.create(createCcBackupDto);
  }

  @Get()
  findAll() {
    return this.ccBackupService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ccBackupService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCcBackupDto: UpdateCcBackupDto,
  ) {
    return this.ccBackupService.update(id, updateCcBackupDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ccBackupService.remove(id);
  }
}
