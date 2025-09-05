#!/usr/bin/env node

import { existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const serverDir = path.join(rootDir, 'server');

console.log('🔍 Checking development environment setup...\n');

// Check if frontend dependencies are installed
const frontendNodeModules = path.join(rootDir, 'node_modules');
if (!existsSync(frontendNodeModules)) {
  console.log('❌ Frontend dependencies not found');
  console.log('📦 Installing frontend dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit', cwd: rootDir });
    console.log('✅ Frontend dependencies installed\n');
  } catch (error) {
    console.error('❌ Failed to install frontend dependencies');
    process.exit(1);
  }
} else {
  console.log('✅ Frontend dependencies found\n');
}

// Check if backend dependencies are installed
const backendNodeModules = path.join(serverDir, 'node_modules');
if (!existsSync(backendNodeModules)) {
  console.log('❌ Backend dependencies not found');
  console.log('📦 Installing backend dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit', cwd: serverDir });
    console.log('✅ Backend dependencies installed\n');
  } catch (error) {
    console.error('❌ Failed to install backend dependencies');
    process.exit(1);
  }
} else {
  console.log('✅ Backend dependencies found\n');
}

// Check if nodemon is available in backend
try {
  execSync('npm list nodemon', { stdio: 'pipe', cwd: serverDir });
  console.log('✅ Nodemon available for backend development\n');
} catch (error) {
  console.log('❌ Nodemon not found in backend dependencies');
  console.log('📦 Installing backend dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit', cwd: serverDir });
    console.log('✅ Backend dependencies installed\n');
  } catch (error) {
    console.error('❌ Failed to install backend dependencies');
    process.exit(1);
  }
}

// Verify Tailwind CSS setup
const tailwindConfig = path.join(rootDir, 'tailwind.config.js');
const postcssConfig = path.join(rootDir, 'postcss.config.js');

if (existsSync(tailwindConfig) && existsSync(postcssConfig)) {
  console.log('✅ Tailwind CSS configuration found\n');
} else {
  console.log('⚠️  Tailwind CSS configuration incomplete');
  console.log('   Check TAILWIND-FIX-INSTRUCTIONS.md for setup details\n');
}

console.log('🎉 Setup check complete! You can now run:');
console.log('   npm run dev     # Start both frontend and backend');
console.log('   npm run dev:client   # Frontend only');
console.log('   npm run dev:server   # Backend only\n');

console.log('📖 See DEVELOPMENT-SETUP.md for detailed instructions');