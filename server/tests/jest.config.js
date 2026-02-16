module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: [
    'services/**/*.js',
    '!services/index.js'
  ],
  coverageDirectory: 'coverage',
  verbose: true
};
