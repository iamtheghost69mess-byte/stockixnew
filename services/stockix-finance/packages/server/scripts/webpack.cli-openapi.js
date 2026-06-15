const { getCommonWebpackOptions } = require('./webpack.common');

const inputEntry = './src/cli-openapi.ts';
const outputDir = '../build';
const outputFilename = 'cli-openapi.js';

module.exports = getCommonWebpackOptions({
  inputEntry,
  outputDir,
  outputFilename,
});
