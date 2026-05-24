import { Inject, Service } from 'typedi';
import { Router, Request, Response, NextFunction } from 'express';
import { query } from 'express-validator';
import asyncMiddleware from '@/api/middleware/asyncMiddleware';
import BaseFinancialReportController from './BaseFinancialReportController';
import { AbilitySubject, ReportsAction } from '@/interfaces';
import CheckPolicies from '@/api/middleware/CheckPolicies';
import RealizedGainLossService from '@/services/FinancialStatements/RealizedGainLoss/RealizedGainLossService';

@Service()
export default class RealizedGainLossController extends BaseFinancialReportController {
  @Inject()
  realizedGainLossService: RealizedGainLossService;

  /**
   * Router constructor.
   */
  router() {
    const router = Router();

    router.get(
      '/',
      CheckPolicies(
        ReportsAction.READ_REALIZED_GAIN_LOSS,
        AbilitySubject.Report
      ),
      [
        query('from_date').optional().isISO8601(),
        query('to_date').optional().isISO8601(),
      ],
      this.validationResult,
      asyncMiddleware(this.realizedGainLoss.bind(this))
    );
    return router;
  }

  /**
   * Retrieve realized gain or loss report.
   */
  private async realizedGainLoss(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const { tenantId } = req;
    const filter = this.matchedQueryData(req);

    try {
      const report = await this.realizedGainLossService.realizedGainLoss(
        tenantId,
        { fromDate: filter.fromDate, toDate: filter.toDate }
      );
      return res.status(200).send(report);
    } catch (error) {
      next(error);
    }
  }
}
