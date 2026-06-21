/**
 * Dashboard-only reminder of which PIN was set (last two digits). The real PIN lives hashed on User.
 */
function pinHintFromPlain(plain) {
  const s = String(plain || "").replace(/\D/g, "");
  if (s.length < 4 || s.length > 6) return "";
  return `••••${s.slice(-2)}`;
}

module.exports = { pinHintFromPlain };
