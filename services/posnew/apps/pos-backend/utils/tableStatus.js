const CANONICAL_TABLE = [
  "available",
  "reserved",
  "occupied",
  "billed",
  "closed",
];

function toCanonical(status) {
  if (status == null || status === "") return "available";
  const lower = String(status).toLowerCase();
  if (lower === "free") return "available";
  if (lower === "booked") return "occupied";
  if (CANONICAL_TABLE.includes(lower)) return lower;
  return "available";
}

function displayStatus(status) {
  return toCanonical(status);
}

module.exports = { toCanonical, displayStatus, CANONICAL_TABLE };
