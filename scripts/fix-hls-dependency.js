#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

console.log('🔧 Fixing HLS.js dependency issue...');

try {
  // Get the project root directory
  const projectRoot = path.resolve(__dirname, '..');
  
  console.log(`📁 Working in: ${projectRoot}`);
  
  // Change to project root
  process.chdir(projectRoot);
  
  console.log('📦 Installing missing dependencies...');
  
  // Install the missing hls.js package
  execSync('npm install hls.js@^1.5.13', { 
    stdio: 'inherit',
    cwd: projectRoot 
  });
  
  console.log('✅ HLS.js dependency installed successfully!');
  
  // Also install types for TypeScript support
  try {
    execSync('npm install --save-dev @types/hls.js', { 
      stdio: 'inherit',
      cwd: projectRoot 
    });
    console.log('✅ HLS.js TypeScript types installed!');
  } catch (error) {
    console.log('⚠️ TypeScript types not available, but that\'s okay');
  }
  
  console.log('\n🎉 Frontend dependency fix complete!');
  console.log('\n📋 Next steps:');
  console.log('1. ✅ Backend is already running (port 3001)');
  console.log('2. 🚀 Start frontend: npm run frontend');
  console.log('3. 🌐 Open browser: http://localhost:3000');
  
} catch (error) {
  console.error('❌ Error fixing dependencies:', error.message);
  process.exit(1);
}