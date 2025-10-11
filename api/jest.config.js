/**
 * Jest Configuration for ES Modules
 * 
 * This configuration enables Jest to work with ES modules,
 * which is required for our project structure.
 */

export default {
  // Use node as the test environment
  testEnvironment: 'node',

  // Transform ES modules
  transform: {},

  // File extensions to consider
  moduleFileExtensions: ['js', 'json'],

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!**/node_modules/**',
    '!**/__tests__/**'
  ],

  // Coverage threshold (optional - adjust as needed)
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/'
  ],

  // Module name mapper for aliases (if you use path aliases)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },

  // Setup files to run before tests
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Verbose output
  verbose: true,

  // Detect open handles (useful for debugging)
  detectOpenHandles: false,

  // Force exit after tests complete
  forceExit: true,

  // Timeout for tests (30 seconds)
  testTimeout: 30000,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks between tests
  restoreMocks: true,

  // Reset mocks between tests
  resetMocks: false
}
