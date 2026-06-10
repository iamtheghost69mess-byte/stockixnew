const path = require('path');
const { NormalModuleReplacementPlugin, ProvidePlugin } = require('webpack');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const { RunScriptWebpackPlugin } = require('run-script-webpack-plugin');
const nodeExternals = require('webpack-node-externals');
const ProgressBarPlugin = require('progress-bar-webpack-plugin');

// ENV-EXEMPT: build tooling
const isDev = process.env.NODE_ENV === 'development';

exports.getCommonWebpackOptions = ({
  inputEntry,
  outputDir,
  outputFilename,
}) => {
  const webpackOptions = {
    entry: ['regenerator-runtime/runtime', inputEntry],
    target: 'node',
    mode: isDev ? 'development' : 'production',
    watch: isDev,
    watchOptions: {
      aggregateTimeout: 200,
      poll: 1000,
    },
    output: {
      path: path.resolve(__dirname, outputDir),
      filename: outputFilename,
    },
    resolve: {
      alias: {
        // Workspace packages have no pre-built dist — resolve from source directly.
        '@stockix/email-components': path.resolve(__dirname, '../../../shared/email-components/src/lib/main.ts'),
        '@stockix/pdf-templates': path.resolve(__dirname, '../../../shared/pdf-templates/src/index.ts'),
        '@stockix/utils': path.resolve(__dirname, '../../../shared/bigcapital-utils/src/index.ts'),
        // md-to-react-email expects CJS marked exports (webpack ESM interop).
        marked: require.resolve('marked'),
      },
      extensions: ['.ts', '.tsx', '.js'],
      extensionAlias: {
        '.ts': ['.js', '.ts'],
        '.cts': ['.cjs', '.cts'],
        '.mts': ['.mjs', '.mts'],
      },
      plugins: [
        new TsconfigPathsPlugin({
          configFile: path.resolve(__dirname, '../tsconfig.json'),
          extensions: ['.ts', '.tsx', '.js'],
        }),
      ],
    },
    plugins: [
      // Ignore knex dynamic required dialects that we don't use.
      // IMPORTANT: Do NOT include mysql or mysql2 — those are the actual drivers
      // this app uses for MariaDB/MySQL.
      new NormalModuleReplacementPlugin(
        /mssql|oracle(db)?|sqlite3|pg(-native|-query-stream|-pool|-escape)?$|tedious/,
        'noop2'
      ),
      // Ignore optional native/platform-specific packages that are not needed at runtime.
      new NormalModuleReplacementPlugin(
        /^(cardinal|fsevents|graphql|hbs|@fastify\/static|@nestjs\/microservices(\/microservices-module)?|class-transformer\/storage)$/,
        'noop2'
      ),
      new ProgressBarPlugin(),
      // Auto-inject React into TSX files compiled with jsx:"react" that omit the import.
      new ProvidePlugin({ React: 'react' }),
    ],
    externals: [
      nodeExternals({
        // Use package-local node_modules so knex/mysql2 stay externalized.
        // This preserves knex runtime migration file loading from filesystem.
        modulesDir: path.resolve(__dirname, '../node_modules'),
        // Bundle @/ path aliases and @stockix workspace packages into the output.
        allowlist: [/^@\//, /^@stockix\//],
      }),
      'aws-sdk',
      'prettier',
    ],
    module: {
      rules: [
        {
          test: /\.([cm]?ts|tsx|js)$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
                configFile: 'tsconfig.json',
              },
            },
          ],
          // Compile @stockix/* workspace packages from source — they have no pre-built dist.
          exclude: /node_modules\/(?!@stockix\/)/,
        },
      ],
    },
    optimization: {
      minimize: false,
    },
  };

  if (isDev) {
    webpackOptions.plugins.push(
      new RunScriptWebpackPlugin({ name: outputFilename })
    );
  }
  return webpackOptions;
};
