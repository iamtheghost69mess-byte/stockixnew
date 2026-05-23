import 'reflect-metadata'; // We need this in order to use @Decorators
import './before';
import '@/config';

import express from 'express';
import loadersFactory from 'loaders';

async function startServer() {
  console.log('--- SERVER BOOTSTRAP STARTING ---');
  const app = express();

  try {
    // Intiialize all registered loaders.
    await loadersFactory({ expressApp: app });
  } catch (err) {
    console.error('--- FATAL BOOTSTRAP ERROR ---');
    console.error(err);
    process.exit(1);
  }

  app.listen(app.get('port'), (err) => {
    if (err) {
      console.log(err);
      process.exit(1);
      return;
    }
    console.log(`
      ################################################
        Server listening on port: ${app.get('port')}
      ################################################
    `);
  });
}

startServer();
