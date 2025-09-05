#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

console.log('🔧 Fixing Frontend Dependencies...')

// Check if node_modules exists
const nodeModulesPath = path.join(process.cwd(), 'node_modules')
const packageLockPath = path.join(process.cwd(), 'package-lock.json')

if (!fs.existsSync(nodeModulesPath)) {
  console.log('📦 Installing dependencies...')
  try {
    execSync('npm install', { stdio: 'inherit' })
    console.log('✅ Dependencies installed successfully')
  } catch (error) {
    console.error('❌ Failed to install dependencies:', error.message)
    process.exit(1)
  }
} else {
  console.log('✅ Dependencies already installed')
}

// Check if sonner is properly installed
const sonnerPath = path.join(nodeModulesPath, 'sonner')
if (!fs.existsSync(sonnerPath)) {
  console.log('📦 Installing sonner toast library...')
  try {
    execSync('npm install sonner', { stdio: 'inherit' })
    console.log('✅ Sonner installed successfully')
  } catch (error) {
    console.error('❌ Failed to install sonner:', error.message)
  }
} else {
  console.log('✅ Sonner library available')
}

// Verify key dependencies
const keyDeps = ['react', 'vite', 'sonner', 'lucide-react', 'tailwindcss']
console.log('\n📋 Verifying key dependencies:')

keyDeps.forEach(dep => {
  const depPath = path.join(nodeModulesPath, dep)
  if (fs.existsSync(depPath)) {
    console.log(`   ✅ ${dep}`)
  } else {
    console.log(`   ❌ ${dep} - Missing!`)
  }
})

console.log('\n🚀 Frontend dependency check complete!')
console.log('💡 Run: npm run frontend')