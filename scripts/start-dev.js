#!/usr/bin/env node

import { spawn, exec } from 'child_process';
import { killProcessOnPort, findAvailablePort } from './kill-port.js';

async function startDevelopment() {
  console.log('🚀 Starting ONVIF Video Management System...\n');

  try {
    // Step 1: Clean up any existing processes
    console.log('🧹 Cleaning up existing processes...');
    await killProcessOnPort(3000); // Frontend
    await killProcessOnPort(3001); // Backend
    
    // Step 2: Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 3: Find available ports
    console.log('🔍 Finding available ports...');
    const frontendPort = await findAvailablePort(3000);
    const backendPort = await findAvailablePort(3001);
    
    if (frontendPort !== 3000) {
      console.log(`⚠️  Using alternative frontend port: ${frontendPort}`);
    }
    
    if (backendPort !== 3001) {
      console.log(`⚠️  Using alternative backend port: ${backendPort}`);
    }
    
    console.log('\n🎯 Starting services...\n');
    
    // Step 4: Start frontend
    console.log('🎨 Starting frontend...');
    const frontendProcess = spawn('npm', ['run', 'frontend'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { 
        ...process.env,
        PORT: frontendPort.toString()
      }
    });
    
    frontendProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Local:') || output.includes('ready')) {
        console.log(`✅ Frontend ready: http://localhost:${frontendPort}`);
      }
      process.stdout.write(`[Frontend] ${output}`);
    });
    
    frontendProcess.stderr.on('data', (data) => {
      process.stderr.write(`[Frontend] ${data}`);
    });
    
    // Step 5: Start backend (with a slight delay)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('🔧 Starting backend...');
    const backendProcess = spawn('npm', ['run', 'backend'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { 
        ...process.env,
        PORT: backendPort.toString()
      }
    });
    
    backendProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Server running')) {
        console.log(`✅ Backend ready: http://localhost:${backendPort}`);
        
        // Update frontend API configuration if needed
        if (backendPort !== 3001) {
          console.log(`\n💡 Backend started on port ${backendPort}`);
          console.log(`   Please update your frontend API_BASE_URL to: http://localhost:${backendPort}/api`);
        }
      }
      process.stdout.write(`[Backend] ${output}`);
    });
    
    backendProcess.stderr.on('data', (data) => {
      process.stderr.write(`[Backend] ${data}`);
    });
    
    // Handle process termination
    process.on('SIGINT', () => {
      console.log('\n🔄 Shutting down gracefully...');
      frontendProcess.kill('SIGINT');
      backendProcess.kill('SIGINT');
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      console.log('\n🔄 Shutting down gracefully...');
      frontendProcess.kill('SIGTERM');
      backendProcess.kill('SIGTERM');
      process.exit(0);
    });
    
    // Wait for processes to finish
    await Promise.all([
      new Promise(resolve => frontendProcess.on('close', resolve)),
      new Promise(resolve => backendProcess.on('close', resolve))
    ]);
    
  } catch (error) {
    console.error('💥 Failed to start development environment:', error.message);
    console.error('\n🛠️  Try manual cleanup:');
    console.error('   npm run cleanup');
    console.error('   npm run kill-port 3000');
    console.error('   npm run kill-port 3001');
    process.exit(1);
  }
}

// Check if this file is being run directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  startDevelopment();
}