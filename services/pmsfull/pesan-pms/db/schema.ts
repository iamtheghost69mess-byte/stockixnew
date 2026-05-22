import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Better Auth tables
export const user = sqliteTable("user", {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const session = sqliteTable("session", {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' })
});

export const account = sqliteTable("account", {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const verification = sqliteTable("verification", {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
});

export const passkey = sqliteTable("passkey", {
  id: text('id').primaryKey(),
  name: text('name'),
  publicKey: text('public_key').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  credentialID: text('credential_i_d').notNull(),
  counter: integer('counter').notNull(),
  deviceType: text('device_type').notNull(),
  backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
  transports: text('transports'),
  createdAt: integer('created_at', { mode: 'timestamp' })
});

// Legacy Users table has been replaced by Better Auth's user table

// Properties table
export const properties = sqliteTable('properties', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  name: text('name').notNull(),
  type: text('type').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  state: text('state'),
  country: text('country').notNull(),
  zipCode: text('zip_code'),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(Date.now()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(Date.now()),
});

// Rooms table
export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  name: text('name').notNull(),
  type: text('type').notNull(),
  capacity: integer('capacity').notNull(),
  rate: integer('rate').notNull(),
  description: text('description'),
  amenities: text('amenities'),
  status: text('status').notNull().default('available'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(Date.now()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(Date.now()),
});

// Guests table
export const guests = sqliteTable('guests', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  country: text('country'),
  zipCode: text('zip_code'),
  idType: text('id_type'),
  idNumber: text('id_number'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(Date.now()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(Date.now()),
});

// Bookings table
export const bookings = sqliteTable('bookings', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  roomId: text('room_id').notNull().references(() => rooms.id),
  guestId: text('guest_id').notNull().references(() => guests.id),
  checkIn: text('check_in').notNull(),
  checkOut: text('check_out').notNull(),
  adults: integer('adults').notNull().default(1),
  children: integer('children').notNull().default(0),
  totalAmount: integer('total_amount').notNull(),
  paymentStatus: text('payment_status').notNull().default('pending'),
  bookingStatus: text('booking_status').notNull().default('confirmed'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(Date.now()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(Date.now()),
});

// Payments table
export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  bookingId: text('booking_id').notNull().references(() => bookings.id),
  amount: integer('amount').notNull(),
  method: text('method').notNull(),
  status: text('status').notNull().default('completed'),
  transactionId: text('transaction_id'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(Date.now()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(Date.now()),
});
