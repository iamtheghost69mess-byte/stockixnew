/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/unit'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^utils(.*)$': '<rootDir>/src/utils/index',
  },
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'babel-jest',
  },
};
