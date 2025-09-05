#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function killProcessOnPort(port) {
  try {
    console.log(`🔍 Checking for processes on port ${port}...`);
    
    // Check what's using the port
    const { stdout } = await execAsync(`lsof -ti:${port}`).catch(() => ({ stdout: '' }));
    
    if (stdout.trim()) {
      const pids = stdout.trim().split('\n').filter(pid => pid);
      console.log(`📋 Found processes using port ${port}: ${pids.join(', ')}`);
      
      for (const pid of pids) {
        try {
          console.log(`🔪 Killing process ${pid}...`);
          await execAsync(`kill -9 ${pid}`);
          console.log(`✅ Successfully killed process ${pid}`);
        } catch (error) {
          console.log(`⚠️  Could not kill process ${pid}: ${error.message}`);
        }
      }
      
      // Wait a moment for processes to cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify the port is now free
      const { stdout: checkStdout } = await execAsync(`lsof -ti:${port}`).catch(() => ({ stdout: '' }));
      if (checkStdout.trim()) {
        console.log(`❌ Port ${port} is still in use after cleanup attempt`);
        return false;
      } else {
        console.log(`✅ Port ${port} is now available`);
        return true;
      }
    } else {
      console.log(`✅ Port ${port} is already available`);
      return true;
    }
  } catch (error) {
    console.error(`❌ Error checking/killing processes on port ${port}:`, error.message);
    return false;
  }
}

export async function findAvailablePort(startPort, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    try {
      const { stdout } = await execAsync(`lsof -ti:${port}`).catch(() => ({ stdout: '' }));
      if (!stdout.trim()) {
        console.log(`✅ Found available port: ${port}`);
        return port;
      }
    } catch (error) {
      // Port is available if lsof fails
      console.log(`✅ Found available port: ${port}`);
      return port;
    }
  }
  
  throw new Error(`No available ports found in range ${startPort}-${startPort + maxAttempts - 1}`);
}

async function main() {
  const port = process.argv[2] || '3001';
  
  console.log(`🚀 Port cleanup utility for port ${port}\n`);
  
  const success = await killProcessOnPort(port);
  
  if (!success) {
    console.log(`\n🔄 Attempting to find alternative port...`);
    try {
      const alternativePort = await findAvailablePort(parseInt(port) + 1);
      console.log(`💡 Suggested alternative port: ${alternativePort}`);
      console.log(`\nTo use alternative port, update your package.json scripts:`);
      console.log(`"dev": "concurrently \\"npm run frontend\\" \\"PORT=${alternativePort} npm run backend\\""`);
    } catch (error) {
      console.error(`❌ Could not find alternative port: ${error.message}`);
    }
  }
  
  console.log(`\n📝 Manual cleanup commands if needed:`);
  console.log(`   Kill specific process: kill -9 <PID>`);
  console.log(`   Kill all on port: lsof -ti:${port} | xargs kill -9`);
  console.log(`   Check port usage: lsof -i:${port}`);
}

// Check if this file is being run directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}