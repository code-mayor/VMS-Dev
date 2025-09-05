#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function fixPortConflict() {
  console.log('🔧 ONVIF VMS - Port Conflict Fix Utility\n');
  
  try {
    console.log('Step 1: Checking for processes using ports 3000 and 3001...');
    
    // Check both ports
    const ports = [3000, 3001];
    const processesToKill = [];
    
    for (const port of ports) {
      try {
        const { stdout } = await execAsync(`lsof -ti:${port}`);
        if (stdout.trim()) {
          const pids = stdout.trim().split('\n');
          processesToKill.push(...pids.map(pid => ({ port, pid })));
          console.log(`   📍 Port ${port} is used by process(es): ${pids.join(', ')}`);
        } else {
          console.log(`   ✅ Port ${port} is available`);
        }
      } catch (error) {
        console.log(`   ✅ Port ${port} is available`);
      }
    }
    
    if (processesToKill.length > 0) {
      console.log('\nStep 2: Killing conflicting processes...');
      for (const { port, pid } of processesToKill) {
        try {
          await execAsync(`kill -9 ${pid}`);
          console.log(`   ✅ Killed process ${pid} (was using port ${port})`);
        } catch (error) {
          console.log(`   ⚠️  Could not kill process ${pid}: ${error.message}`);
        }
      }
      
      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log('\n✅ No port conflicts detected!');
    }
    
    console.log('\nStep 3: Verifying ports are now free...');
    let allClear = true;
    
    for (const port of ports) {
      try {
        const { stdout } = await execAsync(`lsof -ti:${port}`);
        if (stdout.trim()) {
          console.log(`   ❌ Port ${port} is still in use`);
          allClear = false;
        } else {
          console.log(`   ✅ Port ${port} is now available`);
        }
      } catch (error) {
        console.log(`   ✅ Port ${port} is now available`);
      }
    }
    
    if (allClear) {
      console.log('\n🎉 All port conflicts resolved!');
      console.log('\nYou can now start the development server:');
      console.log('   npm run dev');
    } else {
      console.log('\n⚠️  Some ports are still in use. Manual intervention may be required.');
      console.log('\nTry these commands:');
      console.log('   lsof -i:3000  # Check what\'s using port 3000');
      console.log('   lsof -i:3001  # Check what\'s using port 3001');
      console.log('   kill -9 <PID>  # Kill specific process');
    }
    
    // Also check for any zombie node processes
    console.log('\nStep 4: Checking for zombie Node.js processes...');
    try {
      const { stdout } = await execAsync(`ps aux | grep -i "node.*onvif\\|node.*vms\\|node.*3001\\|node.*3000" | grep -v grep`);
      if (stdout.trim()) {
        console.log('   ⚠️  Found potential zombie processes:');
        console.log(stdout.split('\n').map(line => `      ${line}`).join('\n'));
        console.log('\n   Consider killing these manually if issues persist.');
      } else {
        console.log('   ✅ No zombie Node.js processes found');
      }
    } catch (error) {
      console.log('   ✅ No zombie Node.js processes found');
    }
    
    console.log('\n📋 Summary:');
    console.log('   - Port conflict fix utility completed');
    console.log('   - Ports 3000 and 3001 should now be available');
    console.log('   - Run "npm run dev" to start the application');
    console.log('\n🔗 Useful commands for future reference:');
    console.log('   npm run cleanup     # Clean up ports before starting');
    console.log('   npm run kill-port 3001  # Kill specific port');
    console.log('   lsof -i:3001       # See what\'s using a port');
    
  } catch (error) {
    console.error('❌ Error during port conflict fix:', error.message);
    console.log('\n🛠️  Manual steps to resolve:');
    console.log('1. Find processes: lsof -i:3001');
    console.log('2. Kill processes: kill -9 <PID>');
    console.log('3. Restart: npm run dev');
    process.exit(1);
  }
}

// Check if this file is being run directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  fixPortConflict();
}