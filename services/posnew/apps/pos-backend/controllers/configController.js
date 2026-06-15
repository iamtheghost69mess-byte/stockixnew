const createHttpError = require("http-errors");
const TaxConfig = require("../models/taxConfigModel");
const { invalidateTaxRateCache } = require("../utils/orderTotals");

async function getTax(req, res, next) {
  try {
    const orgId = req.tenantOrganizationId;
    let doc;
    if (orgId) {
      doc = await TaxConfig.findOne({ key: "default", organization: orgId });
      if (!doc) {
        doc = await TaxConfig.create({
          key: "default",
          rate: 0.0525,
          organization: orgId,
        });
      }
    } else {
      doc = await TaxConfig.findOne({
        key: "default",
        $or: [{ organization: null }, { organization: { $exists: false } }],
      });
      if (!doc) {
        doc = await TaxConfig.create({ key: "default", rate: 0.0525 });
      }
    }
    const rate = Number(doc.rate) || 0.0525;
    res.status(200).json({
      success: true,
      data: {
        rate,
        ratePercent: Math.round(rate * 10000) / 100,
      },
    });
  } catch (e) {
    next(e);
  }
}

async function putTax(req, res, next) {
  try {
    let rate = req.body.rate;
    if (rate == null && req.body.ratePercent != null) {
      rate = Number(req.body.ratePercent) / 100;
    }
    rate = Number(rate);
    if (Number.isNaN(rate) || rate < 0 || rate > 1) {
      return next(
        createHttpError(
          400,
          "rate must be between 0 and 1, or ratePercent between 0 and 100."
        )
      );
    }
    const orgId = req.tenantOrganizationId;
    const filter = orgId
      ? { key: "default", organization: orgId }
      : {
          key: "default",
          $or: [{ organization: null }, { organization: { $exists: false } }],
        };
    const doc = await TaxConfig.findOneAndUpdate(
      filter,
      { $set: { rate, ...(orgId ? { organization: orgId } : {}) } },
      { upsert: true, new: true }
    );
    invalidateTaxRateCache();
    const r = Number(doc.rate) || rate;
    res.status(200).json({
      success: true,
      data: {
        rate: r,
        ratePercent: Math.round(r * 10000) / 100,
      },
    });
  } catch (e) {
    next(e);
  }
}

module.exports = { getTax, putTax };
