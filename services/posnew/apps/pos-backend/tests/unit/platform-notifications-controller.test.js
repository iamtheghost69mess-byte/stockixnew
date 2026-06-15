const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const PlatformNotification = require("../../models/platformNotificationModel");
const {
  listNotifications,
  markAsRead,
  getUnreadCount,
} = require("../../controllers/platformNotificationsController");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createNext(done) {
  return (error) => {
    done(error || new Error("next() called unexpectedly"));
  };
}

test("listNotifications enforces limit bounds and formats read state", async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const notificationId = new mongoose.Types.ObjectId();
  let capturedQuery = null;
  let capturedLimit = null;

  const originalFind = PlatformNotification.find;
  t.after(() => {
    PlatformNotification.find = originalFind;
  });

  PlatformNotification.find = (query) => {
    capturedQuery = query;
    return {
      sort() {
        return this;
      },
      limit(limitValue) {
        capturedLimit = limitValue;
        return this;
      },
      async lean() {
        return [
          {
            _id: notificationId,
            title: "Organization created",
            body: "Event generated: platform.org.create",
            severity: "info",
            href: null,
            createdAt: new Date("2026-04-17T00:00:00.000Z"),
            readBy: [userId],
          },
        ];
      },
    };
  };

  const req = {
    query: { unread: "true", limit: "9999" },
    platformUser: { _id: userId },
  };
  const res = createResponse();
  await listNotifications(req, res, createNext((error) => {
    throw error;
  }));

  assert.deepEqual(capturedQuery, { readBy: { $ne: userId } });
  assert.equal(capturedLimit, 200);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data[0].id, String(notificationId));
  assert.equal(res.body.data[0].isRead, true);
});

test("markAsRead supports mark all with idempotent addToSet", async (t) => {
  const userId = new mongoose.Types.ObjectId();
  let updateArgs = null;

  const originalUpdateMany = PlatformNotification.updateMany;
  t.after(() => {
    PlatformNotification.updateMany = originalUpdateMany;
  });

  PlatformNotification.updateMany = async (filter, update) => {
    updateArgs = { filter, update };
    return { acknowledged: true };
  };

  const req = {
    params: { id: "all" },
    platformUser: { _id: userId },
  };
  const res = createResponse();
  await markAsRead(req, res, createNext((error) => {
    throw error;
  }));

  assert.equal(res.statusCode, 200);
  assert.deepEqual(updateArgs, {
    filter: { readBy: { $ne: userId } },
    update: { $addToSet: { readBy: userId } },
  });
});

test("markAsRead rejects invalid object id", async () => {
  const req = {
    params: { id: "not-an-id" },
    platformUser: { _id: new mongoose.Types.ObjectId() },
  };
  const res = createResponse();

  await markAsRead(req, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
});

test("getUnreadCount filters by signed-in platform user", async (t) => {
  const userId = new mongoose.Types.ObjectId();
  let capturedQuery = null;

  const originalCountDocuments = PlatformNotification.countDocuments;
  t.after(() => {
    PlatformNotification.countDocuments = originalCountDocuments;
  });

  PlatformNotification.countDocuments = async (query) => {
    capturedQuery = query;
    return 7;
  };

  const req = { platformUser: { _id: userId } };
  const res = createResponse();
  await getUnreadCount(req, res, createNext((error) => {
    throw error;
  }));

  assert.deepEqual(capturedQuery, { readBy: { $ne: userId } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 7);
});

