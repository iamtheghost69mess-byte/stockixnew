/**
 * 50 concurrent mixed orders — validates no cross-printer item leaks on TCP captures.
 */

const path = require("path");
const mongoose = require("mongoose");

const { buildPopulatedLinesFromSpecs } = require("./lib/db-fixture");

function loadOrderPrinting() {
  return require(path.join(
    __dirname,
    "../../apps/pos-backend/services/orderPrinting",
  ));
}

function includesLoose(text, needle) {
  return String(text).toLowerCase().includes(String(needle).toLowerCase());
}

/** @param {number} seed */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MENU_POOL = ["Burger", "Beer", "Grilled Fish", "Water", "Side Salad"];

const ALLOWED_ON_PRINTER = {
  Kitchen: ["Burger", "Side Salad"],
  Bar: ["Beer"],
  Grill: ["Grilled Fish"],
  Receipt: [], // not used in stress kitchen-only dispatch
};

/**
 * @param {{ cluster: any, ctx: any }} args
 */
async function runStressTest({ cluster, ctx }) {
  const { printTicketsForLines } = loadOrderPrinting();
  const seed = Number(process.env.STRESS_SEED || "42");
  const rand = mulberry32(seed);

  cluster.reset();
  const beforeSnap = snapshotTcp(cluster);

  const misroutes = [];
  const drops = [];
  let totalJobs = 0;

  const runOne = async (idx) => {
    const nLines = 1 + Math.floor(rand() * 3);
    const picks = [];
    for (let i = 0; i < nLines; i += 1) {
      picks.push(MENU_POOL[Math.floor(rand() * MENU_POOL.length)]);
    }
    const lines = buildPopulatedLinesFromSpecs(
      ctx.menuByName,
      ctx.catByName,
      ctx.printerByName,
      picks.map((item) => ({ item, qty: 1 + Math.floor(rand() * 2) })),
    );
    const orderStub = {
      _id: new mongoose.Types.ObjectId(),
      organization: ctx.orgId,
      location: ctx.locationId,
      table: { tableNo: ctx.tableNo },
    };
    const dispatch = await printTicketsForLines(orderStub, lines, "order");
    for (const r of dispatch.results) {
      if (!r.ok) drops.push({ idx, err: r.error || "fail" });
    }
  };

  await Promise.all(Array.from({ length: 50 }, (_, k) => runOne(k)));
  await new Promise((r) => setTimeout(r, 500));
  const afterSnap = snapshotTcp(cluster);

  const delta = diffSnapshot(beforeSnap, afterSnap);
  for (const [printer, jobs] of Object.entries(delta)) {
    totalJobs += jobs.length;
    const allowed = ALLOWED_ON_PRINTER[printer];
    if (!allowed || !allowed.length) continue;
    for (const job of jobs) {
      const text = job.readable || "";
      for (const item of MENU_POOL) {
        if (!includesLoose(text, item)) continue;
        const ok = allowed.some((a) => a.toLowerCase() === item.toLowerCase());
        if (!ok) {
          misroutes.push({ printer, item, snippet: text.slice(0, 120) });
        }
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log("\n════════ STRESS TEST (50 concurrent orders) ════════");
  // eslint-disable-next-line no-console
  console.log(`Seed: ${seed}`);
  // eslint-disable-next-line no-console
  console.log(`New TCP jobs observed: ${totalJobs}`);
  // eslint-disable-next-line no-console
  console.log(`Failed station dispatches: ${drops.length}`);
  // eslint-disable-next-line no-console
  console.log(`Misrouted item markers: ${misroutes.length}`);
  if (misroutes.length) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(misroutes.slice(0, 12), null, 2));
  }
  if (drops.length) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(drops.slice(0, 8), null, 2));
  }
  if (misroutes.length || drops.length) {
    throw new Error("Stress test detected routing or dispatch failures.");
  }
  // eslint-disable-next-line no-console
  console.log("Stress test: PASSED\n");
}

function snapshotTcp(cluster) {
  const o = {};
  for (const name of ["Kitchen", "Bar", "Grill", "Receipt"]) {
    o[name] = cluster.getJobs(name).map((j) => ({ readable: j.readable, jobNo: j.jobNo }));
  }
  return o;
}

function diffSnapshot(before, after) {
  const out = {};
  for (const name of Object.keys(after)) {
    const b = before[name] || [];
    const a = after[name] || [];
    if (a.length > b.length) {
      out[name] = a.slice(b.length);
    }
  }
  return out;
}

module.exports = {
  runStressTest,
};
