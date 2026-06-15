const { toCanonical } = require("./tableStatus");

function deriveTableStatusFromLayout(body) {
  if (body.status !== undefined && body.status !== null && String(body.status).trim() !== "") {
    return toCanonical(body.status);
  }
  const persons = Math.max(0, Math.floor(Number(body.personsSeated) || 0));
  if (persons > 0) return "occupied";
  const res = body.reservatorName;
  if (res != null && String(res).trim()) return "reserved";
  return "available";
}

module.exports = { deriveTableStatusFromLayout };
