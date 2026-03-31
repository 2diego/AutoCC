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
import { ConsolidationErrorsService } from './consolidation-errors.service';
import { CreateConsolidationErrorDto } from './dto/create-consolidation-error.dto';
import { UpdateConsolidationErrorDto } from './dto/update-consolidation-error.dto';

@Controller('consolidation-errors')
export class ConsolidationErrorsController {
  constructor(private readonly consolidationErrorsService: ConsolidationErrorsService) {}

  @Post()
  create(@Body() createConsolidationErrorDto: CreateConsolidationErrorDto) {
    return this.consolidationErrorsService.create(createConsolidationErrorDto);
  }

  @Get()
  findAll() {
    return this.consolidationErrorsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.consolidationErrorsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateConsolidationErrorDto: UpdateConsolidationErrorDto,
  ) {
    return this.consolidationErrorsService.update(id, updateConsolidationErrorDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.consolidationErrorsService.remove(id);
  }
}
