const path = require("path");
const { createTransformer } = require("ts-jest").default;

let transformer;

function getTransformer() {
  if (!transformer) {
    transformer = createTransformer({
      tsconfig: path.join(__dirname, "tsconfig.json"),
      isolatedModules: true,
    });
  }
  return transformer;
}

module.exports = {
  process(src, filename, config, options = {}) {
    return getTransformer().process(src, filename, { config, ...options });
  },
};
