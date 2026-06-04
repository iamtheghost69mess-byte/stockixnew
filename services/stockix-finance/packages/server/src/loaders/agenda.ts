import Agenda from 'agenda';
import config from '@/config';

// Redis namespacing convention (Stockix shared Redis):
// Finance Agenda jobs:  agenda:{tenant_slug}:*  (Mongo collection below)
// POS BullMQ queues:    {REDIS_KEY_PREFIX}{queue_name}
//                       e.g. tenant:acme:bigcapital_sync
// Sessions:             tenant:{slug}:session:*
// Do NOT use unprefixed keys on stockix-redis

function resolveAgendaCollection(): string {
  const configured = process.env.AGENDA_DB_COLLECTION?.trim();
  if (configured) return configured;

  const prefix = process.env.REDIS_KEY_PREFIX?.trim() ?? '';
  if (prefix.startsWith('tenant:')) {
    const slugPart = prefix.slice('tenant:'.length).replace(/:$/, '');
    if (slugPart) return `agenda:${slugPart}:jobs`;
  }

  return 'agendaJobs';
}

export default ({ mongoConnection }) => {
  return new Agenda({
    mongo: mongoConnection,
    db: { collection: resolveAgendaCollection() },
    processEvery: config.agenda.pooltime,
    maxConcurrency: config.agenda.concurrency,
  });
};
