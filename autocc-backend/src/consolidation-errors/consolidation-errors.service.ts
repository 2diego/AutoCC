import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateConsolidationErrorDto } from './dto/create-consolidation-error.dto';
import { UpdateConsolidationErrorDto } from './dto/update-consolidation-error.dto';
import { ConsolidationError } from './entities/consolidation-error.entity';

@Injectable()
export class ConsolidationErrorsService {
  constructor(
    @InjectRepository(ConsolidationError)
    private readonly consolidationErrorsRepository: Repository<ConsolidationError>,
  ) {}

  create(createConsolidationErrorDto: CreateConsolidationErrorDto) {
    const entity = this.consolidationErrorsRepository.create(
      createConsolidationErrorDto,
    );
    return this.consolidationErrorsRepository.save(entity);
  }

  findAll() {
    return this.consolidationErrorsRepository.find({ order: { id: 'DESC' } });
  }

  findOne(id: number) {
    return this.consolidationErrorsRepository.findOneBy({ id });
  }

  update(id: number, updateConsolidationErrorDto: UpdateConsolidationErrorDto) {
    return this.consolidationErrorsRepository.update(
      id,
      updateConsolidationErrorDto,
    );
  }

  remove(id: number) {
    return this.consolidationErrorsRepository.delete(id);
  }
}
