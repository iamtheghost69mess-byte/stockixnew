import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonHeaders } from '@/common/decorators/ApiCommonHeaders';
import { AuthorizationGuard } from '@/modules/Roles/Authorization.guard';
import { PermissionGuard } from '@/modules/Roles/Permission.guard';
import { RequirePermission } from '@/modules/Roles/RequirePermission.decorator';
import { AbilitySubject } from '@/modules/Roles/Roles.types';
import { ReportsAction } from '../../types/Report.types';
import { RealizedGainLossService } from './RealizedGainLoss.service';
import { RealizedGainLossQueryDto } from './RealizedGainLossQuery.dto';

@Controller('reports/realized-gain-loss')
@ApiTags('Reports')
@ApiCommonHeaders()
@UseGuards(AuthorizationGuard, PermissionGuard)
export class RealizedGainLossController {
  constructor(private readonly realizedGainLossService: RealizedGainLossService) {}

  @Get()
  @RequirePermission(ReportsAction.READ_REALIZED_GAIN_LOSS, AbilitySubject.Report)
  @ApiOperation({ summary: 'Get realized gain or loss report' })
  public async realizedGainLoss(@Query() query: RealizedGainLossQueryDto) {
    return this.realizedGainLossService.realizedGainLoss(query);
  }
}
