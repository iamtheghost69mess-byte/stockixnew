import { Controller, Get, Next, Req, Res } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { PublicRoute } from '../Auth/guards/jwt.guard';
import {
  isFinanceWebappBuilt,
  FINANCE_WEBAPP_INDEX,
  isFinanceWebappApiPath,
  isFinanceWebappStaticAssetPath,
} from './finance-webapp.constants';

/**
 * Serves the Finance React SPA for client routes such as `/auth/login`.
 * API routes stay under `/api/*` (global prefix).
 */
@Controller()
export class FinanceWebappSpaController {
  @PublicRoute()
  @Get('*')
  serveSpa(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ): void {
    if (!isFinanceWebappBuilt()) {
      next();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    if (isFinanceWebappApiPath(req.path)) {
      next();
      return;
    }
    if (isFinanceWebappStaticAssetPath(req.path)) {
      next();
      return;
    }
    res.sendFile(FINANCE_WEBAPP_INDEX, (err) => {
      if (err) next(err);
    });
  }
}
