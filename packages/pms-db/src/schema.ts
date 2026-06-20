import { AnyPgColumn, boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenants, owners } from '@repo/db/schema';

// ─── PMS: Core tables ────────────────────────────────────────────────────────
// TODO(security): isolate PMS to per-tenant Postgres before public launch

export const pmsProperties = pgTable(
  "pms_properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** hotel | hostel | villa | apartment | guesthouse | resort */
    type: text("type").notNull().default("hotel"),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    description: text("description"),
    /** 24h format, e.g. "14:00" */
    checkInTime: text("check_in_time").notNull().default("14:00"),
    checkOutTime: text("check_out_time").notNull().default("12:00"),
    minNights: integer("min_nights").notNull().default(1),
    /** Days forward from today to accept bookings via OTA iCal. */
    bookingWindow: integer("booking_window").notNull().default(365),
    cleaningEnabled: boolean("cleaning_enabled").notNull().default(true),
    /** Durable slug for iCal export URL — set once, never changes. */
    feedSlug: text("feed_slug").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("pms_properties_tenant_idx").on(t.tenantId),
    uniqueIndex("pms_properties_feed_slug_unique").on(t.feedSlug),
    index("pms_properties_deleted_at_idx").on(t.tenantId, t.deletedAt),
  ],
);

export const pmsRooms = pgTable(
  "pms_rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => pmsProperties.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** standard | deluxe | suite | dormitory | villa */
    type: text("type").notNull().default("standard"),
    capacity: integer("capacity").notNull().default(2),
    rateCents: integer("rate_cents").notNull().default(0),
    /** available | occupied | maintenance | cleaning */
    status: text("status").notNull().default("available"),
    description: text("description"),
    /** JSON array of amenity strings, e.g. ["wifi","ac","minibar"] */
    amenities: text("amenities").notNull().default("[]"),
    floor: integer("floor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("pms_rooms_tenant_idx").on(t.tenantId),
    index("pms_rooms_property_idx").on(t.propertyId),
    index("pms_rooms_deleted_at_idx").on(t.tenantId, t.deletedAt),
  ],
);

export const pmsGuests = pgTable(
  "pms_guests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    // Compliance / registration fields (passport, visa)
    nationality: text("nationality"),
    dateOfBirth: text("date_of_birth"),
    /** passport | national_id | driving_license */
    idType: text("id_type"),
    idNumber: text("id_number"),
    passportNumber: text("passport_number"),
    passportExpiry: text("passport_expiry"),
    issuedBy: text("issued_by"),
    visaNumber: text("visa_number"),
    visaFrom: text("visa_from"),
    visaTo: text("visa_to"),
    hasVisa: boolean("has_visa").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("pms_guests_tenant_idx").on(t.tenantId),
    index("pms_guests_deleted_at_idx").on(t.tenantId, t.deletedAt),
  ],
);

export const pmsBookings = pgTable(
  "pms_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => pmsProperties.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => pmsRooms.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => pmsGuests.id, { onDelete: "cascade" }),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    totalAmountCents: integer("total_amount_cents").notNull().default(0),
    /** confirmed | checked_in | checked_out | cancelled | no_show */
    bookingStatus: text("booking_status").notNull().default("confirmed"),
    /** pending | partial | paid | refunded */
    paymentStatus: text("payment_status").notNull().default("pending"),
    adults: integer("adults").notNull().default(1),
    children: integer("children").notNull().default(0),
    /** direct | airbnb | booking | vrbo | expedia | other */
    platform: text("platform").notNull().default("direct"),
    specialRequests: text("special_requests"),
    notes: text("notes"),
    /** Actual check-in/out timestamps recorded at the front desk. */
    checkInActualAt: timestamp("check_in_actual_at", { withTimezone: true }),
    checkOutActualAt: timestamp("check_out_actual_at", { withTimezone: true }),
    /** pending | synced | failed | error — Finance SaleReceipt sync state. */
    accountingSyncStatus: text("accounting_sync_status").notNull().default("pending"),
    /** Finance SaleReceipt id after successful sync. */
    financeReceiptId: integer("finance_receipt_id"),
    /** Number of sync attempts made. Reset to 0 when status goes to synced. */
    syncAttempts: integer("sync_attempts").notNull().default(0),
    /** Last sync error message (cleared on success). */
    syncError: text("sync_error"),
    /** Timestamp of the most recent successful sync. */
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("pms_bookings_tenant_idx").on(t.tenantId),
    index("pms_bookings_property_idx").on(t.propertyId),
    index("pms_bookings_status_idx").on(t.bookingStatus),
    index("pms_bookings_check_in_idx").on(t.checkIn),
    index("pms_bookings_deleted_at_idx").on(t.tenantId, t.deletedAt),
  ],
);

export const pmsPayments = pgTable(
  "pms_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => pmsBookings.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    /** cash | card | bank_transfer | online | other */
    method: text("method").notNull().default("cash"),
    /** completed | pending | refunded | failed */
    status: text("status").notNull().default("completed"),
    transactionId: text("transaction_id"),
    /** Finance SalePayment id after sync. */
    financePaymentId: integer("finance_payment_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_payments_tenant_idx").on(t.tenantId),
    index("pms_payments_booking_idx").on(t.bookingId),
  ],
);

// ─── PMS: iCal channel sync ───────────────────────────────────────────────────

export const pmsIcalChannels = pgTable(
  "pms_ical_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => pmsProperties.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** airbnb | booking | vrbo | expedia | direct | other */
    platform: text("platform").notNull().default("other"),
    importUrl: text("import_url"),
    exportToken: text("export_token").notNull(),
    /** Days to block before a booking starts (cleaning buffer). */
    bufferBefore: integer("buffer_before").notNull().default(1),
    /** Days to block after a booking ends (cleaning buffer). */
    bufferAfter: integer("buffer_after").notNull().default(1),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    failureCount: integer("failure_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_ical_channels_tenant_idx").on(t.tenantId),
    index("pms_ical_channels_property_idx").on(t.propertyId),
    uniqueIndex("pms_ical_export_token_unique").on(t.exportToken),
  ],
);

/** Synced iCal events from OTA platforms — source of truth for availability. */
export const pmsCalendarEvents = pgTable(
  "pms_calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => pmsProperties.id, { onDelete: "cascade" }),
    /** Source platform slug (airbnb, booking, etc.) */
    platform: text("platform").notNull(),
    /** iCal UID — unique per property+platform, used for upsert/dedup. */
    icalUid: text("ical_uid").notNull(),
    summary: text("summary").notNull().default(""),
    /** YYYY-MM-DD inclusive start. */
    startDate: text("start_date").notNull(),
    /** YYYY-MM-DD exclusive end (iCal convention). */
    endDate: text("end_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_cal_events_tenant_idx").on(t.tenantId),
    index("pms_cal_events_property_platform_idx").on(t.propertyId, t.platform),
    uniqueIndex("pms_cal_events_uid_unique").on(t.propertyId, t.platform, t.icalUid),
  ],
);

/** Audit trail for iCal sync runs. */
export const pmsSyncLogs = pgTable(
  "pms_sync_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => pmsProperties.id, {
      onDelete: "set null",
    }),
    /** info | warn | error | success */
    level: text("level").notNull().default("info"),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_sync_logs_tenant_idx").on(t.tenantId),
    index("pms_sync_logs_property_idx").on(t.propertyId),
  ],
);

/** Open / closed date overrides per property. */
export const pmsDateOverrides = pgTable(
  "pms_date_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => pmsProperties.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD */
    date: text("date").notNull(),
    /** open | closed */
    type: text("type").notNull().default("closed"),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_date_overrides_tenant_idx").on(t.tenantId),
    uniqueIndex("pms_date_overrides_property_date_unique").on(t.propertyId, t.date),
  ],
);

// ─── PMS: Housekeeping ────────────────────────────────────────────────────────

export const pmsStaff = pgTable(
  "pms_staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** receptionist | manager | housekeeping | maintenance */
    role: text("role").notNull().default("receptionist"),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pms_staff_tenant_idx").on(t.tenantId)],
);

/** Cleaner profiles — lightweight, no login required. */
export const pmsCleaners = pgTable(
  "pms_cleaners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pms_cleaners_tenant_idx").on(t.tenantId)],
);

/** Per-property cleaner assignment with priority ranking (0 = primary). */
export const pmsCleanerAssignments = pgTable(
  "pms_cleaner_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => pmsProperties.id, { onDelete: "cascade" }),
    cleanerId: uuid("cleaner_id")
      .notNull()
      .references(() => pmsCleaners.id, { onDelete: "cascade" }),
    /** 0 = primary cleaner, 1 = first backup, etc. */
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_cleaner_assignments_tenant_idx").on(t.tenantId),
    index("pms_cleaner_assignments_property_idx").on(t.propertyId),
    uniqueIndex("pms_cleaner_assignments_property_cleaner_unique").on(
      t.propertyId,
      t.cleanerId,
    ),
  ],
);

export const pmsCleaningTasks = pgTable(
  "pms_cleaning_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => pmsProperties.id, {
      onDelete: "set null",
    }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => pmsRooms.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD */
    scheduledDate: text("scheduled_date").notNull(),
    /** pending | in_progress | done | skipped */
    status: text("status").notNull().default("pending"),
    assigneeId: uuid("assignee_id").references(() => pmsStaff.id, {
      onDelete: "set null",
    }),
    cleanerId: uuid("cleaner_id").references(() => pmsCleaners.id, {
      onDelete: "set null",
    }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    notes: text("notes").notNull().default(""),
    /** JSON array of photo URLs captured at completion. */
    photos: text("photos").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_cleaning_tasks_tenant_idx").on(t.tenantId),
    index("pms_cleaning_tasks_date_idx").on(t.scheduledDate),
  ],
);

// ─── PMS: Property manager delegation ────────────────────────────────────────

/** Grants a staff/user delegate access to manage a specific property. */
export const pmsPropertyManagers = pgTable(
  "pms_property_managers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => pmsProperties.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => pmsStaff.id, { onDelete: "cascade" }),
    grantedById: uuid("granted_by_id").references(() => owners.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_property_managers_tenant_idx").on(t.tenantId),
    uniqueIndex("pms_property_managers_property_staff_unique").on(
      t.propertyId,
      t.staffId,
    ),
  ],
);

/** Invite tokens for granting property manager access. */
export const pmsPropertyManagerInvites = pgTable(
  "pms_property_manager_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => pmsProperties.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    createdById: uuid("created_by_id").references(() => owners.id, {
      onDelete: "set null",
    }),
    /** Filled once the invite is accepted. */
    acceptedByStaffId: uuid("accepted_by_staff_id").references(() => pmsStaff.id, {
      onDelete: "set null",
    }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_pm_invites_tenant_idx").on(t.tenantId),
    uniqueIndex("pms_pm_invites_token_unique").on(t.token),
  ],
);

// ─── PMS: Messaging ───────────────────────────────────────────────────────────

export const pmsMessageTemplates = pgTable(
  "pms_message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => pmsProperties.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    /** email | sms | whatsapp */
    channel: text("channel").notNull().default("email"),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull(),
    /** pre_arrival | check_in | check_out | post_stay | custom */
    trigger: text("trigger").notNull().default("custom"),
    /** Days offset from trigger event (negative = before). */
    sendOffsetDays: integer("send_offset_days").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_message_templates_tenant_idx").on(t.tenantId),
    index("pms_message_templates_property_idx").on(t.propertyId),
  ],
);

// ─── PMS: Guest pre-arrival forms ────────────────────────────────────────────

export const pmsGuestFormTemplates = pgTable(
  "pms_guest_form_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => pmsProperties.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    /** JSON array of {id,type,label,required,helpText?,options?} */
    fields: text("fields").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_guest_form_templates_tenant_idx").on(t.tenantId),
    index("pms_guest_form_templates_property_idx").on(t.propertyId),
  ],
);

/** One submission per booking — holds the share token and captured answers. */
export const pmsGuestFormSubmissions = pgTable(
  "pms_guest_form_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => pmsBookings.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => pmsGuestFormTemplates.id, { onDelete: "cascade" }),
    /** Unguessable 32-char base64url — possession is the only auth. */
    shareToken: text("share_token").notNull(),
    /** JSON array of {fieldId,type,label,value} — null until submitted. */
    answers: text("answers"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_guest_form_submissions_tenant_idx").on(t.tenantId),
    index("pms_guest_form_submissions_booking_idx").on(t.bookingId),
    uniqueIndex("pms_guest_form_submissions_token_unique").on(t.shareToken),
  ],
);

