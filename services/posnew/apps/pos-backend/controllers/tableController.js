const Table = require("../models/tableModel");
const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const { randomBytes } = require("crypto");
const QRCode = require("qrcode");
const config = require("../config/config");
const { displayStatus, toCanonical } = require("../utils/tableStatus");
const { deriveTableStatusFromLayout } = require("../utils/tableFloorLayout");
const { emitPos, posSocketOptsFromTable } = require("../utils/socketEmit");
const { assertTenantOrganization } = require("../utils/tenantOrg");
const { canAccessOperation } = require("../services/rbacService");
const { rbacRoleKey } = require("../utils/rbacRoleKey");

function normalizeOptionalString(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function normalizeMoney(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function normalizeFloorAnchor(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(0.98, Math.max(0.02, n));
}

function parseVisibleInPos(bodyValue) {
  return bodyValue === true || bodyValue === "true";
}

/** Staff job title `hostess` (reservations desk) — not RBAC key alone. */
function isHostessStaff(req) {
  return (
    String(req.user?.role ?? "")
      .toLowerCase()
      .trim() === "hostess"
  );
}

/** Matches POS floor visibility: legacy docs without the field count as on POS. */
function tableIsOnPosFloor(tableDoc) {
  return tableDoc.visibleInPos !== false;
}

function createPublicQrToken() {
  return randomBytes(16).toString("hex");
}

async function assignPublicQrTokenById(tableId) {
  const maxAttempts = 5;
  for (let i = 0; i < maxAttempts; i += 1) {
    const token = createPublicQrToken();
    try {
      const updated = await Table.findOneAndUpdate(
        {
          _id: tableId,
          $or: [{ publicQrToken: { $exists: false } }, { publicQrToken: null }, { publicQrToken: "" }],
        },
        { $set: { publicQrToken: token } },
        { new: true }
      );
      if (updated?.publicQrToken) return String(updated.publicQrToken);
      const existing = await Table.findById(tableId).select("publicQrToken").lean();
      if (existing?.publicQrToken) return String(existing.publicQrToken);
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
  throw createHttpError(500, "Could not assign a public QR token for this table.");
}

async function ensurePublicQrToken(tableDoc) {
  if (tableDoc?.publicQrToken) return String(tableDoc.publicQrToken);
  return assignPublicQrTokenById(tableDoc?._id);
}

async function backfillMissingPublicQrTokens(scopeFilter) {
  const rows = await Table.find({
    ...scopeFilter,
    $or: [{ publicQrToken: { $exists: false } }, { publicQrToken: null }, { publicQrToken: "" }],
  })
    .select("_id")
    .limit(100)
    .lean();
  for (const row of rows) {
    await assignPublicQrTokenById(row._id);
  }
}

async function nextTableNoForLocation(orgId, locationId) {
  const query = { organization: orgId };
  if (locationId) query.location = locationId;
  const last = await Table.findOne(query)
    .sort({ tableNo: -1 })
    .select("tableNo")
    .lean();
  const prev = last && Number.isFinite(Number(last.tableNo)) ? Number(last.tableNo) : 0;
  return prev + 1;
}

const formatTable = (t) => {
  const o = t.toObject ? t.toObject() : { ...t };
  o.status = displayStatus(o.status);
  return o;
};

async function readOwnOnlyScope(req) {
  const key = rbacRoleKey(req.user);
  if (!key) return false;
  const orgId = req.tenantOrganizationId || null;
  const [canReadAll, canReadOwn] = await Promise.all([
    canAccessOperation(key, "pos.table.read", orgId),
    canAccessOperation(key, "pos.table.read_own", orgId),
  ]);
  return canReadOwn && !canReadAll;
}

const addTable = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    if (!req.locationScopeId) {
      return next(createHttpError(400, "Location is required to add a table."));
    }
    const {
      tableNo,
      seats,
      section,
      name,
      pricePerPerson,
      reservatorName,
      reservatorPhone,
      reservatorIsVip,
      personsSeated,
      status: layoutStatus,
      floorAnchorX,
      floorAnchorY,
      visibleInPos: visibleInPosBody,
    } = req.body;

    let n;
    if (tableNo !== undefined && tableNo !== null && String(tableNo).trim() !== "") {
      n = Number(tableNo);
      if (!Number.isFinite(n) || n < 1) {
        return next(createHttpError(400, "Invalid table number."));
      }
    } else {
      n = await nextTableNoForLocation(orgId, req.locationScopeId);
    }

    const isTablePresent = await Table.findOne({
      tableNo: n,
      location: req.locationScopeId,
    });

    if (isTablePresent) {
      const error = createHttpError(400, "Table already exist!");
      return next(error);
    }

    const seatCount = Number(seats);
    const sc = Number.isFinite(seatCount) && seatCount >= 1 ? seatCount : 4;
    const ps = Math.max(0, Math.floor(Number(personsSeated) || 0));
    if (ps > sc) {
      return next(createHttpError(400, "personsSeated cannot exceed seats."));
    }

    const resName = normalizeOptionalString(reservatorName);
    const derivedStatus = deriveTableStatusFromLayout({
      status: layoutStatus,
      personsSeated: ps,
      reservatorName: resName,
    });

    const displayName =
      name != null && String(name).trim() ? String(name).trim() : `Table ${n}`;

    const visibleInPos = isHostessStaff(req) ? false : parseVisibleInPos(visibleInPosBody);

    const newTable = new Table({
      organization: orgId,
      tableNo: n,
      seats: sc,
      section: section ? String(section).trim() : "",
      name: displayName,
      pricePerPerson: normalizeMoney(pricePerPerson, 0),
      reservatorName: resName,
      reservatorPhone: normalizeOptionalString(reservatorPhone),
      reservatorIsVip: Boolean(reservatorIsVip),
      personsSeated: ps,
      status: derivedStatus,
      location: req.locationScopeId,
      publicQrToken: createPublicQrToken(),
      visibleInPos,
    });
    if (floorAnchorX !== undefined) {
      newTable.floorAnchorX = normalizeFloorAnchor(floorAnchorX);
    }
    if (floorAnchorY !== undefined) {
      newTable.floorAnchorY = normalizeFloorAnchor(floorAnchorY);
    }
    await newTable.save();
    res.status(201).json({
      success: true,
      message: "Table added!",
      data: formatTable(newTable),
    });
  } catch (error) {
    next(error);
  }
};

const getTableById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid table id."));
    }
    const q = { _id: id };
    if (req.tenantOrganizationId) {
      q.organization = req.tenantOrganizationId;
    }
    if (await readOwnOnlyScope(req)) {
      q.currentWaiter = req.user._id;
    }
    const table = await Table.findOne(q).populate({
      path: "currentOrder",
      select:
        "customerDetails orderStatus bills items orderDate paymentMethod waiter waiterUsername",
      populate: { path: "waiter", select: "name role" },
    });
    if (!table) {
      return next(createHttpError(404, "Table not found."));
    }
    res.status(200).json({ success: true, data: formatTable(table) });
  } catch (e) {
    next(e);
  }
};

const { parsePaginationQuery } = require("../utils/listPagination");

const getTables = async (req, res, next) => {
  try {
    const q = {};
    if (req.tenantOrganizationId) {
      q.organization = req.tenantOrganizationId;
    }
    if (req.locationScopeId) {
      q.location = req.locationScopeId;
    }
    if (await readOwnOnlyScope(req)) {
      q.currentWaiter = req.user._id;
    }
    const pag = parsePaginationQuery(req.query);
    await backfillMissingPublicQrTokens(q);
    const base = Table.find(q)
      .select(
        "_id tableNo seats section status name pricePerPerson reservatorName reservatorPhone reservatorIsVip personsSeated floorAnchorX floorAnchorY currentOrder location organization lastBillPaidAt publicQrToken visibleInPos"
      )
      .populate({
        path: "currentOrder",
        select: "_id orderStatus",
      })
      .lean();

    const [tables, total] = await Promise.all([
      base.clone().sort({ tableNo: 1 }).skip(pag.skip).limit(pag.limit),
      Table.countDocuments(q),
    ]);
    const data = tables.map(formatTable);
    res.status(200).json({
      success: true,
      data,
      page: pag.page,
      limit: pag.limit,
      total,
    });
  } catch (error) {
    next(error);
  }
};

const updateTable = async (req, res, next) => {
  try {
    const {
      status,
      orderId,
      tableNo,
      seats,
      section,
      name,
      pricePerPerson,
      reservatorName,
      reservatorPhone,
      reservatorIsVip,
      personsSeated,
      floorAnchorX,
      floorAnchorY,
      visibleInPos: visibleInPosBody,
    } = req.body;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(404, "Invalid id!"));
    }

    const tq = { _id: id };
    if (req.tenantOrganizationId) {
      tq.organization = req.tenantOrganizationId;
    }
    const table = await Table.findOne(tq);
    if (!table) {
      return next(createHttpError(404, "Table not found!"));
    }

    if (isHostessStaff(req) && tableIsOnPosFloor(table)) {
      return next(
        createHttpError(403, "This table appears on the POS floor. Only an admin can change it."),
      );
    }

    if (tableNo !== undefined && tableNo !== null) {
      const n = Number(tableNo);
      if (!Number.isFinite(n) || n < 1) {
        return next(createHttpError(400, "Invalid table number."));
      }
      const clashQ = {
        tableNo: n,
        _id: { $ne: table._id },
        location: table.location,
      };
      if (req.tenantOrganizationId) {
        clashQ.organization = req.tenantOrganizationId;
      }
      const clash = await Table.findOne(clashQ);
      if (clash) {
        return next(createHttpError(400, "That table number is already in use."));
      }
      table.tableNo = n;
    }
    if (seats !== undefined && seats !== null) {
      const s = Number(seats);
      if (!Number.isFinite(s) || s < 1) {
        return next(createHttpError(400, "Invalid seat count."));
      }
      table.seats = s;
      if (table.personsSeated > table.seats) {
        table.personsSeated = table.seats;
      }
    }
    if (section !== undefined) {
      table.section = section == null ? "" : String(section).trim();
    }

    if (name !== undefined) {
      table.name = name == null ? "" : String(name).trim();
    }
    if (pricePerPerson !== undefined && pricePerPerson !== null) {
      table.pricePerPerson = normalizeMoney(pricePerPerson, table.pricePerPerson ?? 0);
    }
    if (reservatorName !== undefined) {
      table.reservatorName = normalizeOptionalString(reservatorName);
    }
    if (reservatorPhone !== undefined) {
      table.reservatorPhone = normalizeOptionalString(reservatorPhone);
    }
    if (reservatorIsVip !== undefined && reservatorIsVip !== null) {
      table.reservatorIsVip = Boolean(reservatorIsVip);
    }
    if (personsSeated !== undefined && personsSeated !== null) {
      const ps = Math.max(0, Math.floor(Number(personsSeated) || 0));
      if (ps > table.seats) {
        return next(createHttpError(400, "personsSeated cannot exceed seats."));
      }
      table.personsSeated = ps;
    }
    if (floorAnchorX !== undefined) {
      table.floorAnchorX = normalizeFloorAnchor(floorAnchorX);
    }
    if (floorAnchorY !== undefined) {
      table.floorAnchorY = normalizeFloorAnchor(floorAnchorY);
    }

    if (status !== undefined) {
      table.status = toCanonical(status);
    } else if (
      personsSeated !== undefined ||
      reservatorName !== undefined ||
      reservatorPhone !== undefined
    ) {
      table.status = deriveTableStatusFromLayout({
        personsSeated: table.personsSeated,
        reservatorName: table.reservatorName,
      });
    }
    if (orderId !== undefined) {
      if (orderId === null || orderId === "") {
        table.set("currentOrder", undefined);
      } else {
        table.currentOrder = orderId;
        table.lastBillPaidAt = null;
      }
    }
    if (visibleInPosBody !== undefined && !isHostessStaff(req)) {
      table.visibleInPos = parseVisibleInPos(visibleInPosBody);
    }

    await table.save();

    emitPos(
      req,
      "table:status-changed",
      { tableId: String(table._id) },
      posSocketOptsFromTable(table)
    );

    const populated = await Table.findById(table._id).populate({
      path: "currentOrder",
      select: "customerDetails orderStatus bills items waiter waiterUsername",
      populate: { path: "waiter", select: "name role" },
    });

    res.status(200).json({
      success: true,
      message: "Table updated!",
      data: formatTable(populated),
    });
  } catch (error) {
    next(error);
  }
};

const deleteTable = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid table id."));
    }
    const tq = { _id: id };
    if (req.tenantOrganizationId) {
      tq.organization = req.tenantOrganizationId;
    }
    const table = await Table.findOne(tq);
    if (!table) {
      return next(createHttpError(404, "Table not found."));
    }
    if (isHostessStaff(req) && tableIsOnPosFloor(table)) {
      return next(
        createHttpError(403, "This table is on the POS floor. Only an admin can delete it."),
      );
    }
    if (table.currentOrder) {
      return next(
        createHttpError(400, "Close the check on this table before deleting it."),
      );
    }
    await Table.deleteOne({ _id: table._id });
    emitPos(req, "table:status-changed", { tableId: String(id) }, posSocketOptsFromTable(table));
    res.status(200).json({ success: true, message: "Table deleted." });
  } catch (e) {
    next(e);
  }
};

const getTableQr = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid table id."));
    }
    const qq = { _id: id };
    if (req.tenantOrganizationId) {
      qq.organization = req.tenantOrganizationId;
    }
    if (await readOwnOnlyScope(req)) {
      qq.currentWaiter = req.user._id;
    }
    const table = await Table.findOne(qq);
    if (!table) {
      return next(createHttpError(404, "Table not found."));
    }
    const tableToken = await ensurePublicQrToken(table);
    const url = `${config.publicAppUrl}/self-order?table=${encodeURIComponent(tableToken)}`;
    const png = await QRCode.toBuffer(url, {
      type: "png",
      width: 280,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    res.type("image/png").send(png);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  addTable,
  getTables,
  getTableById,
  updateTable,
  deleteTable,
  getTableQr,
};
