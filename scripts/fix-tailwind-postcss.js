#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing Tailwind CSS v4 PostCSS Integration...\n');

try {
  // Check if @tailwindcss/postcss is installed
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  const hasPostCSSPlugin = 
    (packageJson.dependencies && packageJson.dependencies['@tailwindcss/postcss']) ||
    (packageJson.devDependencies && packageJson.devDependencies['@tailwindcss/postcss']);

  if (!hasPostCSSPlugin) {
    console.log('📦 Installing @tailwindcss/postcss...');
    execSync('npm install @tailwindcss/postcss --save-dev', { stdio: 'inherit' });
    console.log('✅ @tailwindcss/postcss installed successfully!\n');
  } else {
    console.log('✅ @tailwindcss/postcss is already installed\n');
  }

  // Verify PostCSS config
  const postcssConfigPath = path.join(process.cwd(), 'postcss.config.js');
  if (fs.existsSync(postcssConfigPath)) {
    const postcssConfig = fs.readFileSync(postcssConfigPath, 'utf8');
    if (postcssConfig.includes('@tailwindcss/postcss')) {
      console.log('✅ PostCSS configuration is correct');
    } else {
      console.log('⚠️  PostCSS configuration needs manual update');
      console.log('   Update postcss.config.js to use @tailwindcss/postcss');
    }
  }

  console.log('\n🚀 Ready to start frontend:');
  console.log('   npm run frontend');
  console.log('\n🌐 Expected URL: http://localhost:3000');

} catch (error) {
  console.error('❌ Error fixing Tailwind PostCSS:', error.message);
  process.exit(1);
}