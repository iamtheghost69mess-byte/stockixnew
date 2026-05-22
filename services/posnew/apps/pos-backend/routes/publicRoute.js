const express = require("express");
const rateLimit = require("express-rate-limit");
const { getPublicMenu } = require("../controllers/publicController");
const { submitSelfOrder } = require("../controllers/selfOrderController");
const { withRateLimitStore } = require("../middlewares/rateLimitStore");

const router = express.Router();

const lim = rateLimit(
  withRateLimitStore(
    {
      windowMs: 60_000,
      limit: 80,
      standardHeaders: true,
      legacyHeaders: false,
    },
    "public:menu"
  )
);

router.get("/menu", lim, getPublicMenu);
router.post("/self-order", lim, submitSelfOrder);

module.exports = router;
