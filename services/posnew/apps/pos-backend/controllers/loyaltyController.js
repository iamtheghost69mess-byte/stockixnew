const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const Order = require("../models/orderModel");
const LoyaltyAccount = require("../models/loyaltyAccountModel");
const { getLoyaltyConfig } = require("../services/loyaltyService");

function normalizeOrderStatus(s) {
  if (s == null || s === "") return "pending";
  const key = String(s).toLowerCase().trim().replace(/\s+/g, " ");
  const map = {
    "in progress": "in-progress",
    pending: "pending",
    ready: "ready",
    served: "served",
    paid: "paid",
    cancelled: "cancelled",
  };
  if (map[key]) return map[key];
  return String(s).toLowerCase().replace(/\s+/g, "-");
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const getConfig = async (req, res, next) => {
  try {
    const cfg = await getLoyaltyConfig(req.tenantOrganizationId);
    res.status(200).json({ success: true, data: cfg });
  } catch (e) {
    next(e);
  }
};

const putConfig = async (req, res, next) => {
  try {
    const { pointsPerRupee, pointsPerRupeeOff, minRedeemPoints } = req.body;
    let cfg = await getLoyaltyConfig(req.tenantOrganizationId);
    if (pointsPerRupee !== undefined) {
      cfg.pointsPerRupee = Math.max(0, Number(pointsPerRupee) || 0);
    }
    if (pointsPerRupeeOff !== undefined) {
      cfg.pointsPerRupeeOff = Math.max(1, Number(pointsPerRupeeOff) || 1);
    }
    if (minRedeemPoints !== undefined) {
      cfg.minRedeemPoints = Math.max(0, Number(minRedeemPoints) || 0);
    }
    await cfg.save();
    res.status(200).json({ success: true, data: cfg });
  } catch (e) {
    next(e);
  }
};

const redeemPreview = async (req, res, next) => {
  try {
    const { customerId, points } = req.body;
    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      return next(createHttpError(400, "Valid customerId is required."));
    }
    const pts = Math.floor(Number(points) || 0);
    if (pts <= 0) {
      return next(createHttpError(400, "points must be positive."));
    }
    const cfg = await getLoyaltyConfig(req.tenantOrganizationId);
    if (pts < cfg.minRedeemPoints) {
      return next(
        createHttpError(
          400,
          `Minimum ${cfg.minRedeemPoints} points required for redemption.`
        )
      );
    }
    const accQ = { customer: customerId };
    if (req.tenantOrganizationId) {
      accQ.organization = req.tenantOrganizationId;
    }
    const acc = await LoyaltyAccount.findOne(accQ);
    if (!acc) {
      return next(createHttpError(404, "Loyalty account not found."));
    }
    if (acc.points < pts) {
      return next(createHttpError(400, "Insufficient points."));
    }
    const discountRupee = round2(pts / cfg.pointsPerRupeeOff);
    res.status(200).json({
      success: true,
      data: {
        discountRupee,
        pointsDebited: pts,
        pointsBalanceAfter: acc.points - pts,
      },
    });
  } catch (e) {
    next(e);
  }
};

const earnFromOrder = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return next(createHttpError(400, "Valid orderId is required."));
    }
    const oq = { _id: orderId };
    if (req.tenantOrganizationId) {
      oq.organization = req.tenantOrganizationId;
    }
    const order = await Order.findOne(oq);
    if (!order) return next(createHttpError(404, "Order not found."));
    if (normalizeOrderStatus(order.orderStatus) !== "paid") {
      return next(createHttpError(400, "Order must be paid to award points."));
    }
    if (!order.customer) {
      return next(
        createHttpError(400, "Order has no linked customer for loyalty.")
      );
    }

    const cfg = await getLoyaltyConfig(req.tenantOrganizationId);
    const base =
      Number(order.bills.totalWithTax) + Number(order.loyaltyDiscountAmount || 0);
    const earned = Math.floor(base * cfg.pointsPerRupee);
    if (earned <= 0) {
      return res.status(200).json({
        success: true,
        data: { pointsAdded: 0 },
      });
    }

    const accFilter = { customer: order.customer };
    if (req.tenantOrganizationId) {
      accFilter.organization = req.tenantOrganizationId;
    }
    const acc =
      (await LoyaltyAccount.findOne(accFilter)) ||
      (await LoyaltyAccount.create({
        organization: req.tenantOrganizationId || order.organization || null,
        customer: order.customer,
        points: 0,
        history: [],
      }));

    const earnNote = `earn:${String(order._id)}`;
    if (acc.history.some((h) => h.note === earnNote)) {
      return res.status(200).json({
        success: true,
        message: "Points already awarded for this order.",
        data: { pointsAdded: 0 },
      });
    }

    acc.points += earned;
    acc.history.push({
      action: "earn",
      delta: earned,
      note: earnNote,
    });
    await acc.save();

    res.status(200).json({
      success: true,
      data: { pointsAdded: earned, balance: acc.points },
    });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  getConfig,
  putConfig,
  redeemPreview,
  earnFromOrder,
};
