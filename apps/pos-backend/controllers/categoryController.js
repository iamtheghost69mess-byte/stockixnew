const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const Category = require("../models/categoryModel");
const MenuItem = require("../models/menuItemModel");
const Printer = require("../models/printerModel");
const { parsePaginationQuery } = require("../utils/listPagination");
const { emitPos } = require("../utils/socketEmit");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseSortOrder(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return Number.NaN;
  return n;
}

const MAX_CATEGORY_PARENT_WALK = 32;

/**
 * Detects cycles or excessive depth walking upward from an existing category id.
 *
 * @param {string} startCategoryId
 * @param {Record<string, unknown>} orgFilter
 * @returns {Promise<string|null>} Error message or null when OK
 */
async function validateMenuCategoryParentChainAcyclic(startCategoryId, orgFilter) {
  const rows = await Category.find(orgFilter).select("_id parentCategory").lean();
  const parentOf = new Map();
  for (const r of rows) {
    const pid = r.parentCategory != null ? String(r.parentCategory) : null;
    parentOf.set(String(r._id), pid);
  }
  let cur = String(startCategoryId);
  const seen = new Set();
  let depth = 0;
  while (cur && depth < MAX_CATEGORY_PARENT_WALK) {
    if (seen.has(cur)) {
      return "Category parent chain contains a cycle. Fix category hierarchy before continuing.";
    }
    seen.add(cur);
    const next = parentOf.get(cur) ?? null;
    if (!next) {
      break;
    }
    cur = next;
    depth += 1;
  }
  if (depth >= MAX_CATEGORY_PARENT_WALK && cur) {
    return "Category hierarchy exceeds maximum depth or may contain a cycle.";
  }
  return null;
}

/** All strict descendant category ids (BFS), excluding `rootCategoryId` itself. */
async function collectDescendantCategoryIds(rootCategoryId, orgFilter) {
  const out = new Set();
  let frontier = [String(rootCategoryId)];
  while (frontier.length > 0) {
    const oids = frontier
      .filter((fid) => mongoose.Types.ObjectId.isValid(fid))
      .map((fid) => new mongoose.Types.ObjectId(fid));
    if (!oids.length) break;
    const children = await Category.find({
      ...orgFilter,
      parentCategory: { $in: oids },
    })
      .select("_id")
      .lean();
    frontier = [];
    for (const ch of children) {
      const sid = String(ch._id);
      if (!out.has(sid)) {
        out.add(sid);
        frontier.push(sid);
      }
    }
  }
  return out;
}

const listCategories = async (req, res, next) => {
  try {
    const filter = req.tenantOrganizationId
      ? { organization: req.tenantOrganizationId }
      : {};
    const pag = parsePaginationQuery(req.query);
    const base = Category.find(filter)
      .populate("parentCategory", "name color")
      .populate("printerAssignment", "name")
      .populate("revenueAccount", "code name type")
      .sort({ sortOrder: 1, name: 1 });

    if (pag.active) {
      const [categories, total] = await Promise.all([
        base.clone().skip(pag.skip).limit(pag.limit),
        Category.countDocuments(filter),
      ]);
      return res.status(200).json({
        success: true,
        data: categories,
        page: pag.page,
        limit: pag.limit,
        total,
      });
    }

    const categories = await base;
    res.status(200).json({ success: true, data: categories });
  } catch (e) {
    next(e);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const orgFilter = req.tenantOrganizationId
      ? { organization: req.tenantOrganizationId }
      : {};
    const {
      name,
      color,
      parentCategory,
      printerAssignment,
      availableFrom,
      availableTo,
      menuNote,
      revenueAccount,
      sortOrder,
    } = req.body;

    if (!name || !String(name).trim()) {
      return next(createHttpError(400, "Name is required."));
    }
    const normalizedName = String(name).trim();
    const sameName = await Category.findOne({
      ...orgFilter,
      name: { $regex: `^${escapeRegex(normalizedName)}$`, $options: "i" },
    }).select("_id");
    if (sameName) {
      return next(createHttpError(400, "Category name already exists."));
    }

    if (parentCategory && !mongoose.Types.ObjectId.isValid(parentCategory)) {
      return next(createHttpError(400, "Invalid parent category id."));
    }
    if (parentCategory) {
      const parent = await Category.findOne({ _id: parentCategory, ...orgFilter });
      if (!parent) {
        return next(createHttpError(400, "Parent category not found."));
      }
      const chainErr = await validateMenuCategoryParentChainAcyclic(
        String(parentCategory),
        orgFilter
      );
      if (chainErr) {
        return next(createHttpError(400, chainErr));
      }
    }

    if (
      printerAssignment &&
      !mongoose.Types.ObjectId.isValid(printerAssignment)
    ) {
      return next(createHttpError(400, "Invalid printer id."));
    }
    if (printerAssignment) {
      const pr = await Printer.findOne({
        _id: printerAssignment,
        ...orgFilter,
      });
      if (!pr) {
        return next(createHttpError(400, "Printer not found."));
      }
    }

    let revAcc = null;
    if (revenueAccount && mongoose.Types.ObjectId.isValid(revenueAccount)) {
      revAcc = revenueAccount;
    }

    const parsedSortOrder = parseSortOrder(sortOrder);
    if (Number.isNaN(parsedSortOrder)) {
      return next(createHttpError(400, "sortOrder must be a positive integer."));
    }
    const lastRow = await Category.findOne(orgFilter).sort({ sortOrder: -1 }).select("sortOrder").lean();
    const nextAvailable = (lastRow?.sortOrder || 0) + 1;
    let finalSortOrder = parsedSortOrder ?? nextAvailable;

    if (parsedSortOrder != null) {
      const sameSortOrder = await Category.findOne({
        ...orgFilter,
        sortOrder: finalSortOrder,
      }).select("_id");
      if (sameSortOrder) {
        // Fallback to next available instead of erroring if the user provided a duplicate
        finalSortOrder = nextAvailable;
      }
    }

    const doc = await Category.create({
      organization: req.tenantOrganizationId || null,
      name: normalizedName,
      sortOrder: finalSortOrder,
      color: color ? String(color).trim() : undefined,
      parentCategory: parentCategory || null,
      printerAssignment: printerAssignment || null,
      availableFrom: availableFrom ? String(availableFrom).trim() : undefined,
      availableTo: availableTo ? String(availableTo).trim() : undefined,
      menuNote: menuNote != null ? String(menuNote).trim() : "",
      revenueAccount: revAcc,
    });

    const populated = await Category.findById(doc._id)
      .populate("parentCategory", "name color")
      .populate("printerAssignment", "name")
      .populate("revenueAccount", "code name");

    emitPos(req, "catalog:updated", { scope: "category", id: String(doc._id) });
    res.status(201).json({
      success: true,
      message: "Category created.",
      data: populated,
    });
  } catch (e) {
    next(e);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const orgFilter = req.tenantOrganizationId
      ? { organization: req.tenantOrganizationId }
      : {};
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid category id."));
    }

    const cat = await Category.findOne({ _id: id, ...orgFilter });
    if (!cat) {
      return next(createHttpError(404, "Category not found."));
    }

    const {
      name,
      color,
      parentCategory,
      printerAssignment,
      availableFrom,
      availableTo,
      menuNote,
      revenueAccount,
      sortOrder,
    } = req.body;

    if (parentCategory !== undefined) {
      if (parentCategory === null || parentCategory === "") {
        cat.parentCategory = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(parentCategory)) {
          return next(createHttpError(400, "Invalid parent category id."));
        }
        if (String(parentCategory) === String(id)) {
          return next(
            createHttpError(400, "Category cannot be its own parent.")
          );
        }
        const parent = await Category.findOne({ _id: parentCategory, ...orgFilter });
        if (!parent) {
          return next(createHttpError(400, "Parent category not found."));
        }
        const descendants = await collectDescendantCategoryIds(id, orgFilter);
        if (descendants.has(String(parentCategory))) {
          return next(
            createHttpError(
              400,
              "Cannot set parent to a descendant category (would create a cycle)."
            )
          );
        }
        const chainErr = await validateMenuCategoryParentChainAcyclic(
          String(parentCategory),
          orgFilter
        );
        if (chainErr) {
          return next(createHttpError(400, chainErr));
        }
        cat.parentCategory = parentCategory;
      }
    }

    if (printerAssignment !== undefined) {
      if (printerAssignment === null || printerAssignment === "") {
        cat.printerAssignment = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(printerAssignment)) {
          return next(createHttpError(400, "Invalid printer id."));
        }
        const pr = await Printer.findOne({
          _id: printerAssignment,
          ...orgFilter,
        });
        if (!pr) {
          return next(createHttpError(400, "Printer not found."));
        }
        cat.printerAssignment = printerAssignment;
      }
    }

    if (color !== undefined) cat.color = String(color).trim();
    if (availableFrom !== undefined) {
      cat.availableFrom = availableFrom
        ? String(availableFrom).trim()
        : undefined;
    }
    if (availableTo !== undefined) {
      cat.availableTo = availableTo ? String(availableTo).trim() : undefined;
    }
    if (menuNote !== undefined) {
      cat.menuNote = menuNote == null ? "" : String(menuNote).trim();
    }
    if (revenueAccount !== undefined) {
      if (revenueAccount === null || revenueAccount === "") {
        cat.revenueAccount = null;
      } else if (mongoose.Types.ObjectId.isValid(revenueAccount)) {
        cat.revenueAccount = revenueAccount;
      }
    }
    if (sortOrder !== undefined) {
      const parsedSortOrder = parseSortOrder(sortOrder);
      if (Number.isNaN(parsedSortOrder)) {
        return next(createHttpError(400, "sortOrder must be a positive integer."));
      }
      const sameSortOrder = await Category.findOne({
        ...orgFilter,
        sortOrder: parsedSortOrder,
        _id: { $ne: cat._id },
      }).select("_id");

      if (sameSortOrder) {
        // Fallback to next available instead of erroring
        const lastRow = await Category.findOne(orgFilter).sort({ sortOrder: -1 }).select("sortOrder").lean();
        cat.sortOrder = (lastRow?.sortOrder || 0) + 1;
      } else {
        cat.sortOrder = parsedSortOrder || 1;
      }
    }
    if (name !== undefined) {
      const normalizedName = String(name).trim();
      const sameName = await Category.findOne({
        ...orgFilter,
        name: { $regex: `^${escapeRegex(normalizedName)}$`, $options: "i" },
        _id: { $ne: cat._id },
      }).select("_id");
      if (sameName) {
        return next(createHttpError(400, "Category name already exists."));
      }
      cat.name = normalizedName;
    }

    await cat.save();

    const populated = await Category.findById(cat._id)
      .populate("parentCategory", "name color")
      .populate("printerAssignment", "name")
      .populate("revenueAccount", "code name");

    emitPos(req, "catalog:updated", { scope: "category", id: String(id) });
    res.status(200).json({
      success: true,
      message: "Category updated.",
      data: populated,
    });
  } catch (e) {
    next(e);
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    const orgFilter = req.tenantOrganizationId
      ? { organization: req.tenantOrganizationId }
      : {};
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid category id."));
    }

    const childCount = await Category.countDocuments({ parentCategory: id, ...orgFilter });
    if (childCount > 0) {
      return next(
        createHttpError(
          400,
          "Cannot delete category that has child categories."
        )
      );
    }

    const itemCount = await MenuItem.countDocuments({ category: id, ...orgFilter });
    if (itemCount > 0) {
      return next(
        createHttpError(
          400,
          "Cannot delete category that has menu items. Reassign or delete items first."
        )
      );
    }

    const deleted = await Category.findOneAndDelete({ _id: id, ...orgFilter });
    if (!deleted) {
      return next(createHttpError(404, "Category not found."));
    }

    emitPos(req, "catalog:updated", { scope: "category", id: String(id) });
    res.status(200).json({ success: true, message: "Category deleted." });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
