#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Fixing Tailwind CSS configuration...');

try {
  // Check if node_modules exists
  if (!fs.existsSync('node_modules')) {
    console.log('📦 Installing dependencies...');
    execSync('npm install', { stdio: 'inherit' });
  }

  // Remove Tailwind v4 specific packages if they exist
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  let needsUpdate = false;
  
  // Remove v4 specific dependencies
  if (packageJson.devDependencies) {
    if (packageJson.devDependencies['@tailwindcss/postcss']) {
      delete packageJson.devDependencies['@tailwindcss/postcss'];
      needsUpdate = true;
      console.log('❌ Removed @tailwindcss/postcss');
    }
    
    // Ensure we have the correct Tailwind version
    if (!packageJson.devDependencies['tailwindcss'] || packageJson.devDependencies['tailwindcss'].includes('4.')) {
      packageJson.devDependencies['tailwindcss'] = '^3.4.15';
      needsUpdate = true;
      console.log('✅ Updated tailwindcss to v3.4.15');
    }
  }
  
  if (needsUpdate) {
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log('📝 Updated package.json');
    
    console.log('🔄 Reinstalling dependencies...');
    execSync('npm install', { stdio: 'inherit' });
  }

  // Verify Tailwind installation
  try {
    execSync('npx tailwindcss --version', { stdio: 'pipe' });
    console.log('✅ Tailwind CSS is properly installed');
  } catch (error) {
    console.log('❌ Tailwind CSS installation failed');
    throw error;
  }

  // Clear any cached CSS
  const distPath = path.join(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    console.log('🧹 Clearing build cache...');
    fs.rmSync(distPath, { recursive: true, force: true });
  }

  console.log('✅ Tailwind CSS configuration fixed!');
  console.log('');
  console.log('🚀 Next steps:');
  console.log('1. Restart your dev server: npm run dev');
  console.log('2. Hard refresh your browser (Ctrl+F5 or Cmd+Shift+R)');
  console.log('3. Check browser DevTools for any CSS errors');
  
} catch (error) {
  console.error('❌ Error fixing Tailwind CSS:', error.message);
  process.exit(1);
}