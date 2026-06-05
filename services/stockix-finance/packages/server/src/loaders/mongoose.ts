import mongoose from 'mongoose';
import { Db } from 'mongodb';
import config from '@/config';

export default async (): Promise<Db> => {
  // REPAIRED: Mongoose 6 — removed v5 connect options 2026-06-05
  const mongooseInstance = await mongoose.connect(config.mongoDb.databaseURL);
  return mongooseInstance.connection.db;
};
