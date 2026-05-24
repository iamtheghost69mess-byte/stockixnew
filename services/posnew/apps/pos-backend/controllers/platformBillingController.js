const createHttpError = require("http-errors");

const inboundWebhook = async (req, res, next) => {
  try {
    return next(
      createHttpError(
        410,
        "Billing webhook ingestion is disabled. License date window is the only runtime access control."
      )
    );
  } catch (e) {
    next(e);
  }
};

const simulateLifecycle = async (req, res, next) => {
  try {
    return next(
      createHttpError(
        410,
        "Billing simulation is disabled. Use organization license dates instead."
      )
    );
  } catch (e) {
    next(e);
  }
};

const simulateSuspend = async (req, res, next) => {
  try {
    return next(
      createHttpError(
        410,
        "Billing suspension simulation is disabled. Use organization license dates instead."
      )
    );
  } catch (e) {
    next(e);
  }
};

module.exports = { inboundWebhook, simulateLifecycle, simulateSuspend };
