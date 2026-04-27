'use strict';

const { initDb: runLegacyBootstrap } = require('../../src/legacyBootstrap');

async function up() {
  await runLegacyBootstrap();
}

module.exports = { up };
