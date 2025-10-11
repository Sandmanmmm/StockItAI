/**
 * Jest Setup File
 * 
 * This file runs before all tests and sets up the test environment.
 */

// Load environment variables from .env.test or .env
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Try to load .env.test first, fall back to .env
dotenv.config({ path: join(__dirname, '.env.test') })
dotenv.config({ path: join(__dirname, '.env') })

// Set test environment
process.env.NODE_ENV = 'test'

// Global test utilities
global.testUtils = {
  // Helper to create unique test identifiers
  generateTestId: () => `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  
  // Helper to wait for async operations
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Helper to suppress console output during tests (optional)
  suppressConsole: () => {
    const noop = () => {}
    global.console = {
      ...console,
      log: noop,
      debug: noop,
      info: noop,
      warn: noop,
      error: noop
    }
  }
}

// Clean up after all tests
afterAll(async () => {
  // Add any global cleanup here
  // For example, close database connections
})

console.log('Jest setup complete - Test environment ready')
