import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { paginationQuerySchema, sendMessageSchema } from '@logimatch/shared';
import { createZodDto } from 'nestjs-zod';
import type { AuthActor } from '../common/actor';
import { CurrentActor } from '../common/decorators';
import { MessagingService } from './messaging.service';

class SendMessageDto extends createZodDto(sendMessageSchema) {}
class PageDto extends createZodDto(paginationQuerySchema) {}

@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  list(@CurrentActor() a: AuthActor) {
    return this.messaging.list(a);
  }

  @Get(':id/messages')
  messages(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.messaging.messages(a, id, q);
  }

  @Post(':id/messages')
  send(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: SendMessageDto,
  ) {
    return this.messaging.send(a, id, b.body);
  }
}

@Module({
  controllers: [MessagingController],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
