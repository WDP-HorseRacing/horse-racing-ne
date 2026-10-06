import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainEventPublisher } from './domain-event.publisher';
import { OutboxEventEntity } from './outbox-event.entity';
import { OutboxRelayService } from './outbox-relay.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([OutboxEventEntity])],
  providers: [DomainEventPublisher, OutboxRelayService],
  exports: [DomainEventPublisher],
})
export class DomainEventsModule {}
