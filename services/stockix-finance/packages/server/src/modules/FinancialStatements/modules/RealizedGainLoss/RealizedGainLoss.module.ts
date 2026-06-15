import { Module } from '@nestjs/common';
import { FinancialSheetCommonModule } from '../../common/FinancialSheetCommon.module';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { RealizedGainLossController } from './RealizedGainLoss.controller';
import { RealizedGainLossService } from './RealizedGainLoss.service';

@Module({
  imports: [FinancialSheetCommonModule],
  controllers: [RealizedGainLossController],
  providers: [RealizedGainLossService, TenancyContext],
})
export class RealizedGainLossModule {}
