const { addJob } = require("./jobQueue");

async function enqueueEmail(payload) {
  return addJob("email", "send_resend", payload, {
    attempts: 8,
    backoff: { type: "exponential", delay: 5000 },
  });
}

module.exports = { enqueueEmail };
