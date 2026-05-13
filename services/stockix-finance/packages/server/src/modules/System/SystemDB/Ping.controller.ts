import { Controller, Get, HttpCode } from '@nestjs/common';
import { PublicRoute } from '@/modules/Auth/guards/jwt.guard';

/**
 * Liveness probe for platform provisioning (`FetchStockixFinanceBootstrap` in repo infra).
 * Global prefix `/api` → GET `/api/ping`
 */
@Controller('ping')
@PublicRoute()
export class PingController {
  @Get()
  @HttpCode(200)
  ping() {
    return { status: 'ok' };
  }
}
