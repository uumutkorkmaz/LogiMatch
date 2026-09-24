import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { pricingEstimateSchema } from '@logimatch/shared';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import type { AuthActor } from '../common/actor';
import { CurrentActor } from '../common/decorators';
import { PricingService } from './pricing.service';

class EstimateDto extends createZodDto(pricingEstimateSchema) {}

@ApiTags('pricing')
@ApiBearerAuth()
@Controller()
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Post('pricing/estimate')
  @HttpCode(200)
  estimate(@Body() body: EstimateDto) {
    return this.pricing.estimate(body);
  }

  @Get('shipments/:id/settlement')
  settlement(@CurrentActor() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.pricing.settlement(actor, id);
  }

  @Get('shipments/:id/invoices')
  invoices(@CurrentActor() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.pricing.invoicesFor(actor, id);
  }

  @Get('invoices/:id/pdf')
  async pdf(
    @CurrentActor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.pricing.invoicePdf(actor, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="fatura-taslak-${id}.pdf"`);
    res.send(pdf);
  }
}
