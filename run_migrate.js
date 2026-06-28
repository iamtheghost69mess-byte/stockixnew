const config = require('./knexfile_system.js');
const knex = require('knex')(config);

knex.on('query', (query) => {
  console.log("QUERY:", query.sql, query.bindings);
});

knex.migrate.latest()
  .then(([batchNo, log]) => {
    console.log("SUCCESS:", batchNo, log);
    process.exit(0);
  })
  .catch(err => {
    console.error("MIGRATION ERROR:", err);
    process.exit(1);
  });
