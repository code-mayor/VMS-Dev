#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🔧 Fixing dependency issues...\n');

const projectRoot = process.cwd();
const serverDir = path.join(projectRoot, 'server');

async function fixDependencies() {
  try {
    // 1. Install frontend dependencies
    console.log('📦 Installing frontend dependencies...');
    execSync('npm install', { stdio: 'inherit', cwd: projectRoot });
    console.log('✅ Frontend dependencies installed\n');

    // 2. Ensure server directory exists and has package.json
    if (!fs.existsSync(serverDir)) {
      fs.mkdirSync(serverDir, { recursive: true });
    }

    const serverPackageJsonPath = path.join(serverDir, 'package.json');
    if (!fs.existsSync(serverPackageJsonPath)) {
      console.log('📦 Creating server package.json...');
      const serverPackageJson = {
        "name": "onvif-vms-server",
        "version": "1.0.0",
        "description": "Backend server for ONVIF Video Management System",
        "main": "index.js",
        "scripts": {
          "start": "node index.js",
          "dev": "nodemon index.js",
          "test": "echo \"Error: no test specified\" && exit 1"
        },
        "dependencies": {
          "express": "^4.18.2",
          "cors": "^2.8.5",
          "helmet": "^7.0.0",
          "compression": "^1.7.4",
          "morgan": "^1.10.0",
          "dotenv": "^16.3.1",
          "bcryptjs": "^2.4.3",
          "jsonwebtoken": "^9.0.2",
          "uuid": "^9.0.0"
        },
        "devDependencies": {
          "nodemon": "^3.0.1"
        }
      };
      
      fs.writeFileSync(serverPackageJsonPath, JSON.stringify(serverPackageJson, null, 2));
      console.log('✅ Server package.json created\n');
    }

    // 3. Install server dependencies
    console.log('📦 Installing server dependencies...');
    execSync('npm install', { stdio: 'inherit', cwd: serverDir });
    console.log('✅ Server dependencies installed\n');

    // 4. Create environment file if missing
    const envPath = path.join(projectRoot, '.env');
    if (!fs.existsSync(envPath)) {
      console.log('🔧 Creating environment file...');
      const envContent = `NODE_ENV=development
PORT=3001
JWT_SECRET=local-dev-secret-${Math.random().toString(36).substring(2, 15)}
ONVIF_DISCOVERY_PORT=3702
LOG_LEVEL=info
`;
      fs.writeFileSync(envPath, envContent);
      console.log('✅ Environment file created\n');
    }

    // 5. Create required directories
    const dirs = ['local', 'local/logs', 'local/recordings', 'local/thumbnails'];
    dirs.forEach(dir => {
      const fullPath = path.join(projectRoot, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });
    console.log('✅ Required directories created\n');

    console.log('🎉 All dependencies fixed! You can now run:');
    console.log('   npm run dev');

  } catch (error) {
    console.error('❌ Error fixing dependencies:', error.message);
    process.exit(1);
  }
}

fixDependencies();