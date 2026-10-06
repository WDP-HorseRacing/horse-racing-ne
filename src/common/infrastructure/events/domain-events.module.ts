import { Global, Module } from '@nestjs/common';
import { DomainEventPublisher } from './domain-event.publisher';
import { OutboxRelay } from './outbox-relay.service';

@Global()
@Module({
  providers: [DomainEventPublisher, OutboxRelay],
  exports: [DomainEventPublisher],
})
export class DomainEventsModule {}
