import { Injectable } from '@nestjs/common';
import { HorsesRepository } from '../repositories/horses.repository';

@Injectable()
export class HorsesService {
  constructor(private readonly horsesRepository: HorsesRepository) {}

  findById(id: string, clubId: string) {
    return this.horsesRepository.findById(id, clubId);
  }
}
