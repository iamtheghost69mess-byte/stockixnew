import {
  Controller,
  Get,
  Query,
  UsePipes,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { ExchangeRateApplication } from './ExchangeRates.application';
import { ExchangeRateLatestQueryDto } from './dtos/ExchangeRateLatestQuery.dto';
import { ExchangeRateLatestResponseDto } from './dtos/ExchangeRateLatestResponse.dto';
import { ExchangeRateByDateQueryDto } from './dtos/ExchangeRateByDateQuery.dto';
import { ExchangeRateByDateResponseDto } from './dtos/ExchangeRateByDateResponse.dto';

@Controller('exchange-rates')
@ApiTags('Exchange Rates')
export class ExchangeRatesController {
  constructor(
    private readonly exchangeRateApp: ExchangeRateApplication,
    private readonly cls: ClsService,
  ) {}

  @Get('/latest')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  @ApiOperation({ summary: 'Get the latest exchange rate' })
  @ApiQuery({
    name: 'from_currency',
    description: 'Source currency code (ISO 4217)',
    required: false,
    type: String,
    example: 'USD',
  })
  @ApiQuery({
    name: 'to_currency',
    description: 'Target currency code (ISO 4217)',
    required: false,
    type: String,
    example: 'EUR',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved exchange rate',
    type: ExchangeRateLatestResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid currency code or service error',
  })
  async getLatestExchangeRate(
    @Query() query: ExchangeRateLatestQueryDto,
  ): Promise<ExchangeRateLatestResponseDto> {
    const tenantId = this.cls.get<number>('tenantId');

    const exchangeRate = await this.exchangeRateApp.latest(tenantId, {
      fromCurrency: query.from_currency,
      toCurrency: query.to_currency,
    });
    return exchangeRate;
  }

  @Get('/by-date')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  @ApiOperation({ summary: 'Get exchange rate by currency and date' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved exchange rate',
    type: ExchangeRateByDateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Exchange rate not found' })
  async getRateByDate(
    @Query() query: ExchangeRateByDateQueryDto,
  ): Promise<{ exchange_rate: ExchangeRateByDateResponseDto }> {
    const rate = await this.exchangeRateApp.rateByDate(
      query.currency_code,
      query.date,
    );

    if (!rate) {
      throw new NotFoundException('Exchange rate not found');
    }

    return { exchange_rate: rate };
  }
}
