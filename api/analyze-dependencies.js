/**
 * Dependency Analysis Script
 * Check what dependencies are missing or causing import issues
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

console.log('🔍 Analyzing Dependencies...')
console.log('Environment:', {
  nodeVersion: process.version,
  platform: process.platform,
  cwd: process.cwd()
})

// Test individual imports
const dependencyTests = [
  { name: 'dotenv', import: () => import('dotenv') },
  { name: 'ioredis', import: () => import('ioredis') },
  { name: 'bull', import: () => import('bull') },
  { name: 'express', import: () => import('express') },
  { name: 'openai', import: () => import('openai') },
  { name: 'sharp', import: () => import('sharp') },
  { name: 'xlsx', import: () => import('xlsx') },
  { name: 'csv-parser', import: () => import('csv-parser') },
  { name: 'pdfjs-dist', import: () => import('pdfjs-dist/legacy/build/pdf.mjs') },
  { name: '@prisma/client', import: () => import('@prisma/client') }
]

async function testDependency(dep) {
  try {
    await dep.import()
    console.log(`✅ ${dep.name}: OK`)
    return { name: dep.name, status: 'OK' }
  } catch (error) {
    console.error(`❌ ${dep.name}: ${error.message}`)
    return { name: dep.name, status: 'FAILED', error: error.message }
  }
}

async function testLocalImports() {
  console.log('\n🏠 Testing Local Module Imports...')
  
  const localModules = [
    { name: 'redisManager', path: './src/lib/redisManager.js' },
    { name: 'fileParsingService', path: './src/lib/fileParsingService.js' },
    { name: 'aiProcessingService', path: './src/lib/aiProcessingService.js' },
    { name: 'fileProcessingJobService', path: './src/lib/fileProcessingJobService.js' },
    { name: 'db', path: './src/lib/db.js' },
    { name: 'auth', path: './src/lib/auth.js' }
  ]
  
  const results = []
  
  for (const module of localModules) {
    try {
      const imported = await import(module.path)
      console.log(`✅ ${module.name}: Imported successfully`)
      
      // Check for common exports
      const exports = Object.keys(imported)
      if (exports.length > 0) {
        console.log(`   Exports: ${exports.join(', ')}`)
      }
      
      results.push({ name: module.name, status: 'OK', exports })
    } catch (error) {
      console.error(`❌ ${module.name}: ${error.message}`)
      results.push({ name: module.name, status: 'FAILED', error: error.message })
    }
  }
  
  return results
}

async function checkFileSystem() {
  console.log('\n📁 Checking File System...')
  
  try {
    const srcPath = path.join(__dirname, 'src')
    const libPath = path.join(srcPath, 'lib')
    
    const srcExists = await fs.access(srcPath).then(() => true).catch(() => false)
    const libExists = await fs.access(libPath).then(() => true).catch(() => false)
    
    console.log(`✅ src directory: ${srcExists ? 'EXISTS' : 'MISSING'}`)
    console.log(`✅ lib directory: ${libExists ? 'EXISTS' : 'MISSING'}`)
    
    if (libExists) {
      const libFiles = await fs.readdir(libPath)
      console.log('📄 Files in lib directory:', libFiles.join(', '))
    }
    
    return { srcExists, libExists }
  } catch (error) {
    console.error('❌ File system check failed:', error.message)
    return { error: error.message }
  }
}

async function analyzePdfParseIssue() {
  console.log('\n🐛 Analyzing PDF Processing...')
  
  try {
    // Try to import pdfjs-dist
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    console.log('✅ pdfjs-dist imported successfully')
    
    // Check version and capabilities
    const moduleInfo = {
      version: pdfjsLib.version || 'Unknown',
      hasGetDocument: !!pdfjsLib.getDocument,
      exports: Object.keys(pdfjsLib).slice(0, 10) // Show first 10 exports
    }
    
    console.log('📦 PDF.js Info:', moduleInfo)
    return moduleInfo
  } catch (error) {
    console.error('❌ PDF processing failed:', error.message)
    return { error: error.message }
  }
}

async function generateReport() {
  console.log('\n📊 DEPENDENCY ANALYSIS REPORT')
  console.log('=' .repeat(50))
  
  // Test core dependencies
  console.log('\n📦 Testing Core Dependencies...')
  const depResults = await Promise.all(dependencyTests.map(testDependency))
  
  // Test local imports
  const localResults = await testLocalImports()
  
  // Check file system
  const fsResults = await checkFileSystem()
  
  // Analyze PDF-Parse specific issue
  const pdfResults = await analyzePdfParseIssue()
  
  // Generate summary
  const report = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      cwd: process.cwd()
    },
    dependencies: depResults,
    localModules: localResults,
    fileSystem: fsResults,
    pdfParseAnalysis: pdfResults,
    summary: {
      totalDeps: depResults.length,
      failedDeps: depResults.filter(d => d.status === 'FAILED').length,
      failedLocal: localResults.filter(l => l.status === 'FAILED').length
    }
  }
  
  console.log('\n📋 SUMMARY:')
  console.log(`Core Dependencies: ${report.summary.totalDeps - report.summary.failedDeps}/${report.summary.totalDeps} OK`)
  console.log(`Local Modules: ${localResults.length - report.summary.failedLocal}/${localResults.length} OK`)
  
  if (report.summary.failedDeps > 0 || report.summary.failedLocal > 0) {
    console.log('\n⚠️ ISSUES FOUND:')
    
    depResults.filter(d => d.status === 'FAILED').forEach(dep => {
      console.log(`❌ ${dep.name}: ${dep.error}`)
    })
    
    localResults.filter(l => l.status === 'FAILED').forEach(mod => {
      console.log(`❌ ${mod.name}: ${mod.error}`)
    })
  }
  
  // Save report
  try {
    await fs.writeFile('dependency-analysis-report.json', JSON.stringify(report, null, 2))
    console.log('\n📄 Report saved to: dependency-analysis-report.json')
  } catch (error) {
    console.error('❌ Failed to save report:', error.message)
  }
  
  return report
}

// Run analysis
generateReport()
  .then(report => {
    const success = report.summary.failedDeps === 0 && report.summary.failedLocal === 0
    console.log(`\n🎯 Analysis ${success ? 'COMPLETE' : 'FOUND ISSUES'}`)
    process.exit(success ? 0 : 1)
  })
  .catch(error => {
    console.error('💥 Analysis failed:', error)
    process.exit(1)
  })