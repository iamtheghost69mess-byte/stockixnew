import { Inject, Service } from 'typedi';
import { Router, Request, Response, NextFunction } from 'express';
import { query } from 'express-validator';
import asyncMiddleware from '@/api/middleware/asyncMiddleware';
import BaseFinancialReportController from './BaseFinancialReportController';
import { AbilitySubject, ReportsAction } from '@/interfaces';
import CheckPolicies from '@/api/middleware/CheckPolicies';
import UnrealizedGainLossService from '@/services/FinancialStatements/UnrealizedGainLoss/UnrealizedGainLossService';

@Service()
export default class UnrealizedGainLossController extends BaseFinancialReportController {
  @Inject()
  unrealizedGainLossService: UnrealizedGainLossService;

  /**
   * Router constructor.
   */
  router() {
    const router = Router();

    router.get(
      '/',
      CheckPolicies(
        ReportsAction.READ_UNREALIZED_GAIN_LOSS,
        AbilitySubject.Report
      ),
      [query('as_of_date').optional().isISO8601()],
      this.validationResult,
      asyncMiddleware(this.unrealizedGainLoss.bind(this))
    );
    return router;
  }

  /**
   * Retrieve unrealized gain or loss report.
   */
  private async unrealizedGainLoss(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const { tenantId } = req;
    const filter = this.matchedQueryData(req);

    try {
      const report = await this.unrealizedGainLossService.unrealizedGainLoss(
        tenantId,
        { asOfDate: filter.asOfDate }
      );
      return res.status(200).send(report);
    } catch (error) {
      next(error);
    }
  }
}
