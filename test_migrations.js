const knex = require('knex')(require('./knexfile_system.js'));
knex('KNEX_MIGRATIONS').select('*')
  .then(res => {
    console.log("MIGRATIONS ROWS:", res);
    process.exit(0);
  })
  .catch(err => {
    console.error("ERROR:", err);
    process.exit(1);
  });
