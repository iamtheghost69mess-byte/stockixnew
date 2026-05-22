/**
 * Proves two Socket.IO server instances share broadcasts via @socket.io/redis-adapter.
 * Run: REDIS_URL=redis://127.0.0.1:6379 node scripts/socket-redis-adapter-selftest.js
 */
const http = require("http");
const { Server } = require("socket.io");
const { io: Client } = require("socket.io-client");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

async function main() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    console.log("SKIP: set REDIS_URL to run socket-redis-adapter-selftest");
    process.exit(0);
  }

  const pub = createClient({ url });
  const sub = pub.duplicate();
  await Promise.all([pub.connect(), sub.connect()]);
  const adapter = createAdapter(pub, sub);

  const s1 = http.createServer();
  const s2 = http.createServer();
  const io1 = new Server(s1, { cors: { origin: "*" } });
  const io2 = new Server(s2, { cors: { origin: "*" } });
  io1.adapter(adapter);
  io2.adapter(adapter);

  await new Promise((r) => s1.listen(0, r));
  await new Promise((r) => s2.listen(0, r));
  const p1 = s1.address().port;
  const p2 = s2.address().port;

  io1.on("connection", (sock) => {
    sock.join("demo-room");
  });
  io2.on("connection", (sock) => {
    sock.join("demo-room");
  });

  const client = Client(`http://127.0.0.1:${p2}`, {
    transports: ["websocket"],
    reconnection: false,
  });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("client connect timeout")), 5000);
    client.on("connect", () => {
      clearTimeout(t);
      resolve();
    });
    client.on("connect_error", reject);
  });

  client.on("hello", (msg) => {
    if (msg === "from-io1") {
      console.log("PASS: client on second process received cross-node emit");
      client.close();
      io1.close();
      io2.close();
      s1.close();
      s2.close();
      Promise.all([pub.quit(), sub.quit()]).then(() => process.exit(0));
    }
  });

  await new Promise((r) => setTimeout(r, 200));
  io1.to("demo-room").emit("hello", "from-io1");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
