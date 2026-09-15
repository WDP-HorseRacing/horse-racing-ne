import { Global, Module } from '@nestjs/common';
import { DomainEventPublisher } from './domain-event.publisher';

@Global()
@Module({ providers: [DomainEventPublisher], exports: [DomainEventPublisher] })
export class DomainEventsModule {}
