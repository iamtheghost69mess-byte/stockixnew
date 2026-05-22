const Ingredient = require("../models/ingredientModel");
const StockMovement = require("../models/stockMovementModel");

const lowStockAlerts = async (req, res, next) => {
  try {
    const alerts = await Ingredient.find({
      status: "active",
      $expr: { $lte: ["$currentStock", "$reorderThreshold"] },
      reorderThreshold: { $gt: 0 } 
    }).populate("category", "name").lean();
    res.json({ success: true, data: alerts });
  } catch (e) {
    next(e);
  }
};

const slowMovingStock = async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const pipeline = [
      { $match: { status: "active" } },
      { 
        $lookup: {
          from: "stockmovements",
          let: { ingId: "$_id" },
          pipeline: [
            { $match: { 
                $expr: { $eq: ["$ingredient", "$$ingId"] },
                createdAt: { $gte: thirtyDaysAgo },
                delta: { $lt: 0 }
            }}
          ],
          as: "recentMovements"
        }
      },
      {
        $addFields: {
          recentDeductionsCount: { $size: "$recentMovements" },
          totalDeductedAmount: {
            $sum: "$recentMovements.delta"
          }
        }
      },
      {
        $match: {
          $or: [
             { recentDeductionsCount: 0 },
             { totalDeductedAmount: { $gte: -10 } } 
          ]
        }
      },
      { $sort: { currentStock: -1 } },
      { $limit: 100 }
    ];

    const alerts = await Ingredient.aggregate(pipeline);
    res.json({ success: true, data: alerts });
  } catch (e) {
    next(e);
  }
};

const stockMovementsFeed = async (req, res, next) => {
  try {
    const { limit = 100, skip = 0, organizationId } = req.query;
    const parsedLimit = Number.parseInt(String(limit), 10);
    const parsedSkip = Number.parseInt(String(skip), 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      return res.status(400).json({
        success: false,
        message: "limit must be a positive integer.",
      });
    }
    if (!Number.isFinite(parsedSkip) || parsedSkip < 0) {
      return res.status(400).json({
        success: false,
        message: "skip must be a non-negative integer.",
      });
    }
    const safeLimit = Math.min(parsedLimit, 500);
    const match = {};
    if (organizationId) match.organization = organizationId;

    const feed = await StockMovement.find(match)
       .populate("ingredient", "name currentStock unit")
       .populate("location", "name")
       .populate("user", "name role")
       .sort({ createdAt: -1 })
       .skip(parsedSkip)
       .limit(safeLimit)
       .lean();

    res.json({ success: true, data: feed });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  lowStockAlerts,
  slowMovingStock,
  stockMovementsFeed
};
