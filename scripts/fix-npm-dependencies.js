#!/usr/bin/env node

import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function fixNpmDependencies() {
  console.log('🔧 NPM Dependency Fix Utility\n');
  
  try {
    console.log('Step 1: Checking package.json for problematic dependencies...');
    
    // Read package.json
    const packagePath = './package.json';
    if (!fs.existsSync(packagePath)) {
      throw new Error('package.json not found');
    }
    
    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    console.log('   ✅ package.json loaded successfully');
    
    // Check for problematic dependencies
    const problematicDeps = [
      '@radix-ui/react-sheet'
    ];
    
    let foundProblems = false;
    for (const dep of problematicDeps) {
      if (packageData.dependencies && packageData.dependencies[dep]) {
        console.log(`   ❌ Found problematic dependency: ${dep}`);
        foundProblems = true;
      }
    }
    
    if (!foundProblems) {
      console.log('   ✅ No problematic dependencies found');
    }
    
    console.log('\nStep 2: Cleaning npm cache...');
    try {
      await execAsync('npm cache clean --force');
      console.log('   ✅ npm cache cleaned');
    } catch (error) {
      console.log('   ⚠️  Could not clean npm cache:', error.message);
    }
    
    console.log('\nStep 3: Removing node_modules and package-lock.json...');
    try {
      if (fs.existsSync('./node_modules')) {
        await execAsync('rm -rf node_modules');
        console.log('   ✅ node_modules removed');
      }
      
      if (fs.existsSync('./package-lock.json')) {
        fs.unlinkSync('./package-lock.json');
        console.log('   ✅ package-lock.json removed');
      }
    } catch (error) {
      console.log('   ⚠️  Could not remove files:', error.message);
    }
    
    console.log('\nStep 4: Installing dependencies...');
    try {
      console.log('   🔄 Running npm install...');
      const { stdout, stderr } = await execAsync('npm install', { maxBuffer: 1024 * 1024 * 10 });
      
      if (stderr && !stderr.includes('npm warn')) {
        console.log('   ⚠️  Installation warnings/errors:');
        console.log(stderr);
      }
      
      console.log('   ✅ Dependencies installed successfully');
    } catch (error) {
      console.log('   ❌ npm install failed:');
      console.log(error.message);
      throw error;
    }
    
    console.log('\nStep 5: Verifying critical dependencies...');
    const criticalDeps = [
      '@radix-ui/react-dialog',
      'lucide-react',
      'react',
      'react-dom',
      'vite'
    ];
    
    for (const dep of criticalDeps) {
      try {
        await execAsync(`npm list ${dep}`);
        console.log(`   ✅ ${dep} installed correctly`);
      } catch (error) {
        console.log(`   ⚠️  ${dep} may have issues`);
      }
    }
    
    console.log('\n🎉 Dependency fix completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Run: npm run dev');
    console.log('   2. If issues persist, check the browser console for errors');
    console.log('   3. Verify all UI components are working correctly');
    
  } catch (error) {
    console.error('\n💥 Dependency fix failed:', error.message);
    console.error('\n🛠️  Manual steps to try:');
    console.error('   1. Delete node_modules: rm -rf node_modules');
    console.error('   2. Delete package-lock.json: rm package-lock.json');
    console.error('   3. Clear npm cache: npm cache clean --force');
    console.error('   4. Install dependencies: npm install');
    console.error('   5. Check for any @radix-ui/react-sheet references and remove them');
    process.exit(1);
  }
}

// Check if this file is being run directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  fixNpmDependencies();
}