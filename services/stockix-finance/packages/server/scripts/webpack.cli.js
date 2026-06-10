const { getCommonWebpackOptions } = require('./webpack.common');

const inputEntry = './src/cli.ts';
const outputDir = '../build';
const outputFilename = 'cli.js';

module.exports = getCommonWebpackOptions({
  inputEntry,
  outputDir,
  outputFilename,
});
