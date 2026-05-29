const { getCommonWebpackOptions } = require('./webpack.common');

const inputEntry = './src/main.ts';
const outputDir = '../build';
const outputFilename = 'index.js';

module.exports = getCommonWebpackOptions({
  inputEntry,
  outputDir,
  outputFilename,
});
