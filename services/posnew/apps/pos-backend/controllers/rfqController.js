const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const RequestForQuotation = require("../models/requestForQuotationModel");
const PurchaseOrder = require("../models/purchaseOrderModel");
const { assertTenantOrganization } = require("../utils/tenantOrg");

const listRFQs = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { status } = req.query;
    const q = { organization: orgId };
    if (status) q.status = status;

    const rows = await RequestForQuotation.find(q)
      .populate("suppliers", "name")
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
};

const getRFQ = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const doc = await RequestForQuotation.findOne({ _id: id, organization: orgId })
      .populate("suppliers")
      .populate("responses.supplier")
      .populate("lines.ingredient", "name unit sku");
    if (!doc) return next(createHttpError(404, "RFQ not found"));
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const createRFQ = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { suppliers, lines, notes, expectedAt, reference } = req.body;
    
    const rfq = new RequestForQuotation({
      organization: orgId,
      suppliers,
      lines,
      notes,
      expectedAt,
      reference,
      status: "draft"
    });

    await rfq.save();
    res.status(201).json({ success: true, data: rfq });
  } catch (e) {
    next(e);
  }
};

const sendRFQ = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const doc = await RequestForQuotation.findOne({ _id: id, organization: orgId });
    if (!doc) return next(createHttpError(404, "RFQ not found"));
    if (doc.status !== "draft") return next(createHttpError(400, "RFQ already sent or processed"));

    // Logic for sending (email, etc) would go here
    doc.status = "sent";
    await doc.save();
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const addResponse = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const { supplierId, lineCosts, unitCost, availableDate, notes } = req.body;

    const doc = await RequestForQuotation.findOne({ _id: id, organization: orgId });
    if (!doc) return next(createHttpError(404, "RFQ not found"));
    if (!["sent", "received"].includes(doc.status)) {
      return next(createHttpError(400, "RFQ must be in sent or received status to add responses"));
    }

    doc.responses.push({
      supplier: supplierId,
      unitCost: unitCost || 0,
      lineCosts: lineCosts || [],
      availableDate,
      notes
    });
    doc.status = "received";
    await doc.save();
    res.status(200).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

const convertToPO = async (req, res, next) => {
  try {
    const orgId = assertTenantOrganization(req);
    const { id } = req.params;
    const { responseId, locationId } = req.body;

    const rfq = await RequestForQuotation.findOne({ _id: id, organization: orgId });
    if (!rfq) return next(createHttpError(404, "RFQ not found"));
    if (rfq.status !== "received") {
      return next(createHttpError(400, "RFQ must be in received status to convert to PO"));
    }

    const response = rfq.responses.id(responseId);
    if (!response) return next(createHttpError(404, "Response not found"));

    if (!locationId) return next(createHttpError(400, "locationId is required for PO"));

    // Create PO
    const po = new PurchaseOrder({
      organization: orgId,
      supplier: response.supplier,
      location: locationId,
      status: "confirmed",
      reference: `PO from RFQ ${rfq.reference || rfq._id}`,
      expectedAt: response.availableDate || rfq.expectedAt,
      lines: rfq.lines.map(line => {
        const lineCostMatch = (response.lineCosts || []).find(lc => String(lc.rfqLineId) === String(line._id));
        return {
          ingredient: line.ingredient,
          description: line.description,
          quantityOrdered: line.quantity,
          unitCost: lineCostMatch ? lineCostMatch.unitCost : (response.unitCost || 0)
        };
      })
    });

    await po.save();

    rfq.status = "converted";
    rfq.convertedToPurchaseOrder = po._id;
    response.isSelected = true;
    await rfq.save();

    res.status(201).json({ success: true, data: po });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listRFQs,
  getRFQ,
  createRFQ,
  sendRFQ,
  addResponse,
  convertToPO,
};
