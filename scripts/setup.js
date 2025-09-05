#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('🎥 Setting up Local ONVIF Video Management System...\n');

// Helper function to ensure directory exists
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Helper function to copy file
function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    return true;
  }
  return false;
}

async function setup() {
  try {
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion < 16) {
      console.error('❌ Node.js 16 or higher is required. Current version:', nodeVersion);
      process.exit(1);
    }
    
    console.log('✅ Node.js version check passed:', nodeVersion);
    
    // Install frontend dependencies first
    console.log('📦 Installing frontend dependencies...');
    try {
      execSync('npm install', { stdio: 'inherit', cwd: projectRoot });
      console.log('✅ Frontend dependencies installed');
    } catch (error) {
      console.error('❌ Failed to install frontend dependencies:', error.message);
      process.exit(1);
    }
    
    // Create environment file if it doesn't exist
    const envPath = path.join(projectRoot, '.env');
    const envExamplePath = path.join(projectRoot, '.env.example');
    
    if (!fs.existsSync(envPath)) {
      if (copyFile(envExamplePath, envPath)) {
        console.log('✅ Created .env file from template');
      } else {
        // Create basic .env file
        const defaultEnv = `# Local Development Environment Variables
NODE_ENV=development
PORT=3001
CLIENT_PORT=3000

# Database Configuration
DB_TYPE=sqlite
DB_PATH=./local/database.db

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-${Math.random().toString(36).substring(2, 15)}
JWT_EXPIRES_IN=24h

# ONVIF Configuration
ONVIF_DISCOVERY_PORT=3702
ONVIF_DISCOVERY_ADDRESS=239.255.255.250
ONVIF_TIMEOUT=10000

# Network Configuration
NETWORK_INTERFACE=auto
DISCOVERY_TIMEOUT=5000
MAX_CAMERAS=50

# Recording Configuration
RECORDINGS_PATH=./local/recordings
THUMBNAILS_PATH=./local/thumbnails
MAX_RECORDING_SIZE=1GB
RECORDING_CLEANUP_DAYS=30

# Streaming Configuration
RTSP_PROXY_PORT=8554
WEBRTC_PORT=8080
STREAM_TIMEOUT=30000

# Security
BCRYPT_ROUNDS=12
SESSION_TIMEOUT=3600
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=900

# Logging
LOG_LEVEL=debug
LOG_FILE=./local/logs/app.log
AUDIT_LOG_FILE=./local/logs/audit.log
`;
        fs.writeFileSync(envPath, defaultEnv);
        console.log('✅ Created default .env file');
      }
    }
    
    // Create local directories
    console.log('📁 Creating local directories...');
    const directories = [
      './local',
      './local/logs',
      './local/recordings',
      './local/thumbnails',
      './local/motion_thumbnails',
      './local/temp',
      './local/exports'
    ];
    
    for (const dir of directories) {
      const fullPath = path.join(projectRoot, dir);
      ensureDir(fullPath);
    }
    console.log('✅ Local directories created');
    
    // Install backend dependencies
    console.log('📦 Installing backend dependencies...');
    
    const serverDir = path.join(projectRoot, 'server');
    ensureDir(serverDir);
    
    // Check if server package.json exists
    const serverPackageJson = path.join(serverDir, 'package.json');
    if (fs.existsSync(serverPackageJson)) {
      try {
        execSync('npm install', { stdio: 'inherit', cwd: serverDir });
        console.log('✅ Backend dependencies installed');
      } catch (error) {
        console.warn('⚠️  Backend dependency installation failed, will install manually');
        await installBackendDependenciesManually(serverDir);
      }
    } else {
      await installBackendDependenciesManually(serverDir);
    }
    
    // Create vite.config.js if it doesn't exist
    const viteConfigPath = path.join(projectRoot, 'vite.config.js');
    if (!fs.existsSync(viteConfigPath)) {
      const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['lucide-react']
        }
      }
    }
  }
})
`;
      
      fs.writeFileSync(viteConfigPath, viteConfig);
      console.log('✅ Vite configuration created');
    }
    
    // Create index.html if it doesn't exist
    const indexHtmlPath = path.join(projectRoot, 'index.html');
    if (!fs.existsSync(indexHtmlPath)) {
      const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="ONVIF Video Management System for local network camera management" />
    <title>Local ONVIF Video Management System</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
      
      fs.writeFileSync(indexHtmlPath, indexHtml);
      console.log('✅ Index.html created');
    }
    
    // Create local auth service if it doesn't exist
    await createLocalAuthService();
    
    console.log('\n🎉 Setup completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Review and update .env file with your settings');
    console.log('2. Run "npm run dev" to start the development server');
    console.log('3. Open http://localhost:3000 in your browser');
    console.log('4. Login with:');
    console.log('   - admin@local.dev / admin123');
    console.log('   - operator@local.dev / operator123');
    console.log('   - viewer@local.dev / viewer123');
    console.log('\n📹 Connect your ONVIF cameras to the same network for automatic discovery!');
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

async function installBackendDependenciesManually(serverDir) {
  console.log('📦 Installing backend dependencies manually...');
  
  // Create package.json for server
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
      "sqlite3": "^5.1.6",
      "bcryptjs": "^2.4.3",
      "jsonwebtoken": "^9.0.2",
      "uuid": "^9.0.0",
      "fs-extra": "^11.1.1",
      "xml2js": "^0.6.2",
      "multer": "^1.4.5-lts.1"
    },
    "devDependencies": {
      "nodemon": "^3.0.1"
    },
    "keywords": ["onvif", "video", "management", "camera", "surveillance"],
    "author": "ONVIF VMS Team",
    "license": "MIT"
  };
  
  fs.writeFileSync(path.join(serverDir, 'package.json'), JSON.stringify(serverPackageJson, null, 2));
  
  try {
    execSync('npm install', { stdio: 'inherit', cwd: serverDir });
    console.log('✅ Backend dependencies installed manually');
  } catch (error) {
    console.error('❌ Failed to install backend dependencies manually:', error.message);
    console.log('💡 You can install them later by running: cd server && npm install');
  }
}

async function createLocalAuthService() {
  const servicesDir = path.join(projectRoot, 'services');
  ensureDir(servicesDir);
  
  const localAuthServicePath = path.join(servicesDir, 'local-auth-service.tsx');
  
  if (!fs.existsSync(localAuthServicePath)) {
    const localAuthService = `// Local Authentication Service
const API_BASE_URL = 'http://localhost:3001/api'

export interface UserProfile {
  id: string
  email: string
  role: 'admin' | 'operator' | 'viewer'
  permissions: any
  session_timeout: number
  last_activity: string
  created_at: string
  last_login: string | null
}

class LocalAuthService {
  private currentUser: UserProfile | null = null
  private accessToken: string | null = null

  async signIn(email: string, password: string): Promise<{ user: UserProfile; accessToken: string }> {
    const response = await fetch(\`\${API_BASE_URL}/auth/login\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    const data = await response.json()
    
    if (!data.success) {
      throw new Error(data.error || 'Login failed')
    }

    this.currentUser = data.user
    this.accessToken = data.accessToken
    
    // Store in localStorage for persistence
    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('user', JSON.stringify(data.user))
    
    return {
      user: data.user,
      accessToken: data.accessToken
    }
  }

  async signOut(): Promise<void> {
    this.currentUser = null
    this.accessToken = null
    localStorage.removeItem('accessToken')
    localStorage.removeItem('user')
  }

  async getCurrentSession(): Promise<{ user: UserProfile; accessToken: string } | null> {
    // Check localStorage first
    const token = localStorage.getItem('accessToken')
    const userStr = localStorage.getItem('user')
    
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr)
        this.currentUser = user
        this.accessToken = token
        
        return { user, accessToken: token }
      } catch (error) {
        console.error('Error parsing stored user:', error)
        localStorage.removeItem('accessToken')
        localStorage.removeItem('user')
      }
    }
    
    return null
  }

  hasPermission(user: UserProfile, resource: string, action: string): boolean {
    const permissions = user.permissions[resource]
    return permissions && permissions[action]
  }

  async checkServerHealth(): Promise<boolean> {
    try {
      const response = await fetch(\`\${API_BASE_URL.replace('/api', '')}/health\`)
      const data = await response.json()
      return data.status === 'healthy'
    } catch (error) {
      return false
    }
  }

  // Placeholder methods for compatibility
  setSessionCallbacks() {}
  async extendSession() { return true }
  async requestPasswordReset() { return '' }
  async confirmPasswordReset() {}
  async getUserProfile() { return this.currentUser }
  async checkDemoUsers() { return [] }
}

export const authService = new LocalAuthService()
`;

    fs.writeFileSync(localAuthServicePath, localAuthService);
    console.log('✅ Local auth service created');
  }
}

setup();