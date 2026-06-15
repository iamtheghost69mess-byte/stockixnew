const path = require('path');
const webpack = require('webpack');
const dotenv = require('dotenv-webpack');

// ENV-EXEMPT: build tooling
module.exports = {
  webpack: {
    plugins: [
      new dotenv(),
      new webpack.DefinePlugin({
        'process.env': {
          MONOREPO_VERSION: JSON.stringify(require('../../lerna.json').version),
        },
      }),
    ],

    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
};
