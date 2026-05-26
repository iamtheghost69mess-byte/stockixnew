import { type Page, type Route } from "@playwright/test";

// ─── Constants ────────────────────────────────────────────────────────────────

export const TENANT_ID = "aaaaaaaa-0000-0000-0000-000000000001";
export const PROPERTY_ID = "bbbbbbbb-0000-0000-0000-000000000001";
export const ROOM_ID = "cccccccc-0000-0000-0000-000000000001";
export const GUEST_ID = "dddddddd-0000-0000-0000-000000000001";
export const BOOKING_ID = "eeeeeeee-0000-0000-0000-000000000001";
export const CHANNEL_ID = "ffffffff-0000-0000-0000-000000000001";
export const SHARE_TOKEN = "abc123def456xyz789qrst01";

// ─── Fixture data ─────────────────────────────────────────────────────────────

export const FIXTURES = {
  properties: {
    properties: [
      {
        id: PROPERTY_ID,
        tenantId: TENANT_ID,
        name: "Sunset Villa",
        address: "123 Beach Road, Hurghada",
        feedSlug: "sunset-villa",
        checkInTime: "15:00",
        checkOutTime: "11:00",
        minNights: 2,
        cleaningEnabled: true,
        bookingWindow: 180,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ],
  },
  rooms: {
    rooms: [
      {
        id: ROOM_ID,
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        name: "Ocean Suite 101",
        type: "suite",
        capacity: 2,
        rateCents: 15000,
        floor: 1,
        status: "available",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ],
  },
  bookings: {
    bookings: [
      {
        id: BOOKING_ID,
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        roomId: ROOM_ID,
        guestId: GUEST_ID,
        checkIn: "2024-09-01",
        checkOut: "2024-09-07",
        bookingStatus: "confirmed",
        paymentStatus: "pending",
        totalAmountCents: 90000,
        platform: "airbnb",
        adults: 2,
        children: 0,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ],
  },
  guests: {
    guests: [
      {
        id: GUEST_ID,
        tenantId: TENANT_ID,
        name: "Ahmed Hassan",
        email: "ahmed@example.com",
        phone: "+20501234567",
        nationality: "EG",
        idType: "passport",
        passportNumber: "A12345678",
        hasVisa: true,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ],
  },
  payments: {
    payments: [
      {
        id: "pay-001",
        tenantId: TENANT_ID,
        bookingId: BOOKING_ID,
        amountCents: 45000,
        method: "card",
        status: "completed",
        transactionId: "txn_001",
        createdAt: "2024-01-01T00:00:00Z",
      },
    ],
  },
  channels: {
    channels: [
      {
        id: CHANNEL_ID,
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        platform: "airbnb",
        importUrl: "https://www.airbnb.com/calendar/ical/12345.ics",
        exportToken: "export-token-abc123",
        bufferBefore: 1,
        bufferAfter: 1,
        failureCount: 0,
        enabled: true,
        lastSyncedAt: "2024-08-01T10:00:00Z",
        lastError: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-08-01T10:00:00Z",
      },
    ],
  },
  channelLogs: {
    logs: [
      { id: "log-1", level: "info", message: "[INFO] Synced 3 events for Sunset Villa", createdAt: "2024-08-01T10:00:00Z" },
      { id: "log-2", level: "info", message: "[INFO] Sync complete: 1 property", createdAt: "2024-08-01T10:00:00Z" },
    ],
  },
  channelAlerts: { alerts: [] },
  platformPresets: {
    presets: [
      { slug: "airbnb", displayName: "Airbnb", color: "#FF385C", defaultBufferBefore: 1, defaultBufferAfter: 1 },
      { slug: "booking", displayName: "Booking.com", color: "#003580", defaultBufferBefore: 1, defaultBufferAfter: 1 },
      { slug: "vrbo", displayName: "Vrbo", color: "#245ABC", defaultBufferBefore: 1, defaultBufferAfter: 1 },
      { slug: "expedia", displayName: "Expedia", color: "#FFC72C", defaultBufferBefore: 1, defaultBufferAfter: 1 },
      { slug: "direct", displayName: "Direct", color: "#6B7280", defaultBufferBefore: 0, defaultBufferAfter: 0 },
    ],
  },
  calendarEvents: {
    events: [
      {
        id: "cal-1",
        platform: "airbnb",
        icalUid: "airbnb-uid-001@airbnb.com",
        summary: "Blocked",
        startDate: "2024-09-01",
        endDate: "2024-09-07",
      },
    ],
  },
  dateOverrides: {
    overrides: [
      {
        id: "ov-1",
        propertyId: PROPERTY_ID,
        date: "2024-12-25",
        type: "closed",
        note: "Christmas",
        rateCents: null,
        minNights: null,
      },
    ],
  },
  cleaningTasks: {
    tasks: [
      {
        id: "task-1",
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        roomId: ROOM_ID,
        scheduledDate: "2024-09-07",
        status: "pending",
        notes: "Auto-created on checkout",
        cleanerId: null,
        doneAt: null,
      },
    ],
  },
  cleaners: {
    cleaners: [
      { id: "cleaner-1", tenantId: TENANT_ID, name: "Fatima Al-Amin", phone: "+20509876543" },
    ],
  },
  assignments: { assignments: [] },
  staff: {
    staff: [
      { id: "staff-1", tenantId: TENANT_ID, name: "Omar Sayed", email: "omar@sunsetvilla.com", role: "manager" },
    ],
  },
  managers: { managers: [] },
  invites: { invites: [] },
  occupancy: {
    occupancy: [
      { date: "2024-09-01", bookedRooms: 1, totalRooms: 2, occupancyRate: 0.5 },
      { date: "2024-09-02", bookedRooms: 1, totalRooms: 2, occupancyRate: 0.5 },
    ],
  },
  revenue: {
    byMonth: [{ month: "2024-09", totalCents: 90000, bookings: 1 }],
    byPlatform: [{ platform: "airbnb", totalCents: 90000, bookings: 1 }],
  },
  guestStats: {
    totalGuests: 1,
    returningGuests: 0,
    bookingStatusBreakdown: [{ bookingStatus: "confirmed", count: 1 }],
  },
  messageTemplates: {
    templates: [
      {
        id: "tpl-1",
        tenantId: TENANT_ID,
        name: "Pre-arrival welcome",
        channel: "email",
        trigger: "pre_arrival",
        sendOffsetDays: -3,
        subject: "Your stay is coming up!",
        body: "Hi {{guest_name}}",
        createdAt: "2024-01-01T00:00:00Z",
      },
    ],
  },
  guestForms: {
    templates: [
      {
        id: "gf-tpl-1",
        tenantId: TENANT_ID,
        name: "Pre-arrival form",
        propertyId: PROPERTY_ID,
        fields: JSON.stringify([
          { id: "full_name", type: "text", label: "Full name", required: true },
          { id: "passport_no", type: "text", label: "Passport number", required: true },
          { id: "terms", type: "checkbox", label: "I agree to house rules", required: true },
        ]),
        createdAt: "2024-01-01T00:00:00Z",
      },
    ],
  },
  guestFormSubmission: {
    submission: {
      id: "sub-1",
      bookingId: BOOKING_ID,
      templateId: "gf-tpl-1",
      shareToken: SHARE_TOKEN,
      submittedAt: null,
      answers: null,
    },
  },
  overview: {
    revenue: { totalCents: 90000 },
    bookings: { total: 1, confirmed: 1, checkedIn: 0, checkedOut: 0 },
    occupancy: { rate: 0.5, bookedNights: 6, totalNights: 12 },
  },
};

// ─── Auth helper ─────────────────────────────────────────────────────────────

/**
 * Log in via the dashboard relay endpoint and set session cookie.
 * Falls back gracefully if the auth server is unavailable (mocked).
 */
export async function login(page: Page): Promise<void> {
  const email = process.env.PLATFORM_ADMIN_EMAIL ?? "admin@localhost.test";
  const password = process.env.PLATFORM_ADMIN_PASSWORD ?? "changeme";

  // Mock the login endpoint so tests run without a real auth server
  await page.route("/api/auth/login", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "set-cookie": "stockix_session=mock-session-token; Path=/; HttpOnly; SameSite=Lax",
      },
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.request.post("/api/auth/login", {
    data: { email, password },
  });
}

/**
 * Set the active PMS tenant in sessionStorage.
 * Must be called after navigating to a page (sessionStorage is per-origin).
 */
export async function setTenant(
  page: Page,
  tenantId = TENANT_ID,
  tenantName = "Sunset Hospitality",
): Promise<void> {
  await page.evaluate(
    ([id, name]) => {
      sessionStorage.setItem("pms-tenant-id", id);
      sessionStorage.setItem("pms-tenant-name", name);
      sessionStorage.setItem("pms-tenant-slug", "sunset-hospitality");
    },
    [tenantId, tenantName] as [string, string],
  );
}

/**
 * Mock all /api/pms/* endpoints with fixture data.
 * Call before navigating to any PMS page.
 */
export async function mockPmsRoutes(page: Page): Promise<void> {
  const respond = (body: unknown) => async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  };

  // Properties
  await page.route("**/api/pms/properties?*", respond(FIXTURES.properties));
  await page.route("**/api/pms/properties", respond(FIXTURES.properties));
  await page.route(`**/api/pms/properties/${PROPERTY_ID}`, respond({ property: FIXTURES.properties.properties[0] }));
  await page.route(`**/api/pms/properties/${PROPERTY_ID}/audit`, respond({
    propertyId: PROPERTY_ID,
    propertyName: "Sunset Villa",
    generatedAt: new Date().toISOString(),
    settings: { minNights: 2, bookingWindow: 180, cleaningEnabled: true, checkInTime: "15:00", checkOutTime: "11:00", feedSlugSet: true },
    channels: [],
    counts: { bookings: 1, upcomingBookings: 1, syncedEvents: 2, upcomingSyncedEvents: 2, overrides: { open: 0, closed: 1 } },
    findings: [{ severity: "info", category: "channels", message: "No iCal channels configured", details: {} }],
  }));
  await page.route("**/api/pms/properties", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ property: FIXTURES.properties.properties[0] }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURES.properties) });
    }
  });

  // Rooms
  await page.route("**/api/pms/rooms?*", respond(FIXTURES.rooms));
  await page.route("**/api/pms/rooms", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ room: FIXTURES.rooms.rooms[0] }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURES.rooms) });
    }
  });

  // Bookings
  await page.route("**/api/pms/bookings?*", respond(FIXTURES.bookings));
  await page.route("**/api/pms/bookings", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ booking: FIXTURES.bookings.bookings[0] }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURES.bookings) });
    }
  });
  await page.route(`**/api/pms/bookings/${BOOKING_ID}/check-in`, respond({ booking: { ...FIXTURES.bookings.bookings[0], bookingStatus: "checked_in" } }));
  await page.route(`**/api/pms/bookings/${BOOKING_ID}/check-out`, respond({ booking: { ...FIXTURES.bookings.bookings[0], bookingStatus: "checked_out" }, finance: { queued: true } }));
  await page.route(`**/api/pms/bookings/${BOOKING_ID}/cancel`, respond({ booking: { ...FIXTURES.bookings.bookings[0], bookingStatus: "cancelled" } }));
  await page.route("**/api/pms/bookings/export*", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/csv", body: "id,checkIn,checkOut\n" + BOOKING_ID + ",2024-09-01,2024-09-07" });
  });

  // Guests
  await page.route("**/api/pms/guests?*", respond(FIXTURES.guests));
  await page.route("**/api/pms/guests", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ guest: FIXTURES.guests.guests[0] }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURES.guests) });
    }
  });

  // Payments
  await page.route("**/api/pms/payments?*", respond(FIXTURES.payments));
  await page.route("**/api/pms/payments", respond(FIXTURES.payments));

  // Channels
  await page.route("**/api/pms/channels/logs*", respond(FIXTURES.channelLogs));
  await page.route("**/api/pms/channels/alerts*", respond(FIXTURES.channelAlerts));
  await page.route("**/api/pms/channels/platform-presets", respond(FIXTURES.platformPresets));
  await page.route("**/api/pms/channels/validate-url", respond({ ok: true, safe: true }));
  await page.route("**/api/pms/channels/sync", respond({ synced: true }));
  await page.route(`**/api/pms/channels/${CHANNEL_ID}/rotate-token`, respond({ channel: { ...FIXTURES.channels.channels[0], exportToken: "new-export-token-xyz" } }));
  await page.route("**/api/pms/channels?*", respond(FIXTURES.channels));
  await page.route("**/api/pms/channels", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ channel: FIXTURES.channels.channels[0] }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURES.channels) });
    }
  });

  // Calendar
  await page.route("**/api/pms/calendar/events*", respond(FIXTURES.calendarEvents));

  // Date overrides
  await page.route("**/api/pms/date-overrides?*", respond(FIXTURES.dateOverrides));
  await page.route("**/api/pms/date-overrides", respond(FIXTURES.dateOverrides));

  // Cleaning
  await page.route("**/api/pms/cleaning/tasks*", respond(FIXTURES.cleaningTasks));
  await page.route("**/api/pms/cleaning/cleaners", respond(FIXTURES.cleaners));
  await page.route("**/api/pms/cleaning/assignments*", respond(FIXTURES.assignments));

  // Staff
  await page.route("**/api/pms/staff/managers*", respond(FIXTURES.managers));
  await page.route("**/api/pms/staff/invites*", respond(FIXTURES.invites));
  await page.route("**/api/pms/staff*", respond(FIXTURES.staff));

  // Reports
  await page.route("**/api/pms/reports/occupancy*", respond(FIXTURES.occupancy));
  await page.route("**/api/pms/reports/revenue*", respond(FIXTURES.revenue));
  await page.route("**/api/pms/reports/guests*", respond(FIXTURES.guestStats));

  // Message templates
  await page.route("**/api/pms/message-templates*", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ template: FIXTURES.messageTemplates.templates[0] }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURES.messageTemplates) });
    }
  });

  // Guest forms
  await page.route(`**/api/pms/guest-forms/booking/${BOOKING_ID}/share`, respond(FIXTURES.guestFormSubmission));
  await page.route(`**/api/pms/guest-forms/booking/${BOOKING_ID}`, respond(FIXTURES.guestFormSubmission));
  await page.route("**/api/pms/guest-forms*", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ template: FIXTURES.guestForms.templates[0] }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURES.guestForms) });
    }
  });

  // Overview stats
  await page.route("**/api/pms/reports/revenue*", respond(FIXTURES.revenue));
}

/**
 * Mock the public guest form API endpoint.
 */
export async function mockPublicFormRoutes(page: Page, opts?: {
  alreadySubmitted?: boolean;
  notFound?: boolean;
}): Promise<void> {
  if (opts?.notFound) {
    await page.route(`**/api/pms-public/${SHARE_TOKEN}`, async (route) => {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not_found" }) });
    });
    return;
  }

  const formData = {
    alreadySubmitted: opts?.alreadySubmitted ?? false,
    submittedAt: opts?.alreadySubmitted ? "2024-09-01T12:00:00Z" : null,
    templateName: "Pre-arrival form",
    fields: [
      { id: "full_name", type: "text", label: "Full name", required: true },
      { id: "passport_no", type: "text", label: "Passport number", required: true },
      { id: "arrival_time", type: "text", label: "Estimated arrival time", required: false },
      { id: "terms", type: "checkbox", label: "I agree to house rules", required: true },
    ],
    guestName: "Ahmed Hassan",
    checkIn: "2024-09-01",
    checkOut: "2024-09-07",
  };

  await page.route(`**/api/pms-public/${SHARE_TOKEN}`, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(formData) });
    }
  });
}

/**
 * Navigate to a PMS page with auth + tenant mocked.
 */
export async function goToPmsPage(page: Page, path: string): Promise<void> {
  await mockPmsRoutes(page);
  // Mock the dashboard auth check (session cookie check)
  await page.route("/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "owner-1", email: "admin@localhost.test", role: "super_admin" }),
    });
  });
  await page.goto(path);
  await setTenant(page);
  await page.reload();
}
