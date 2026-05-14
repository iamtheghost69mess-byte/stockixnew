import Knex from 'knex';
import { knexSnakeCaseMappers } from 'objection';
import { systemKnexConfig } from '@/config/knexConfig';

export default async () => {
  const knexInstance = Knex({
    ...systemKnexConfig,
    ...knexSnakeCaseMappers({ upperCase: true }),
  });

  try {
    // Verify connection with a timeout
    await knexInstance.raw('SELECT 1').timeout(5000);
    console.log('✌️ Database loaded and connected!');
  } catch (err) {
    console.error('✘ Database connection failed!');
    throw err;
  }

  return knexInstance;
};