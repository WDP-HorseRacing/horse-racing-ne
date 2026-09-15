import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class DomainEventPublisher {
  constructor(private readonly emitter: EventEmitter2) {}

  publish(name: string, payload: unknown): void {
    this.emitter.emit(name, payload);
  }
}
