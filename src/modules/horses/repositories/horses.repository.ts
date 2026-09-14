import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HorseEntity } from '../entities/horse.entity';

@Injectable()
export class HorsesRepository {
  constructor(
    @InjectRepository(HorseEntity)
    private readonly repository: Repository<HorseEntity>,
  ) {}

  findById(id: string, clubId: string): Promise<HorseEntity | null> {
    return this.repository.findOneBy({ id, clubId });
  }
}
