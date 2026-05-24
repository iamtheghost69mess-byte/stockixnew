const createHttpError = require("http-errors");

const listSubscriptions = async (req, res, next) => {
  try {
    return next(
      createHttpError(
        410,
        "Subscriptions are disabled. License date window is the only source of truth."
      )
    );
  } catch (err) {
    next(err);
  }
};

const updateSubscription = async (req, res, next) => {
  try {
    return next(
      createHttpError(
        410,
        "Subscriptions are disabled. License date window is the only source of truth."
      )
    );
  } catch (err) {
    next(err);
  }
};

module.exports = { listSubscriptions, updateSubscription };
