/**
 * Test Redis Production Setup
 */

import { generateRedisConf } from '../config/redis.production.js'
import fs from 'fs'
import path from 'path'

console.log('🔍 Testing Redis production setup...')

try {
  // Test configuration generation
  console.log('1. Testing config generation...')
  const configContent = generateRedisConf()
  console.log('✅ Config generated successfully')
  console.log('Config preview (first 200 chars):', configContent.substring(0, 200))
  
  // Test directory creation
  console.log('\n2. Testing directory creation...')
  const testDir = './test-redis-setup'
  
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true })
    console.log('✅ Test directory created')
  }
  
  // Test file writing
  console.log('\n3. Testing file writing...')
  const testConfigPath = path.join(testDir, 'test-redis.conf')
  fs.writeFileSync(testConfigPath, configContent)
  console.log('✅ Config file written successfully')
  
  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true })
  console.log('✅ Cleanup completed')
  
  console.log('\n🎉 All tests passed! The setup script should work.')
  
} catch (error) {
  console.error('❌ Test failed:', error)
}