# Quick Fix for Development Server Issues

## Immediate Solution

Run these commands in order:

```bash
# 1. Install backend dependencies (fixes nodemon error)
cd server && npm install && cd ..

# 2. Restart development servers
npm run dev
```

## What This Fixes

- ✅ **nodemon not found** - Installs backend dependencies including nodemon
- ✅ **PostCSS warning** - Already fixed by adding "type": "module" to package.json  
- ✅ **Backend server startup** - Ensures all dependencies are available
- ✅ **Tailwind CSS** - Styles should now load properly

## Alternative: Use Setup Script

```bash
# Automated setup check and fix
npm run check-setup
npm run dev
```

## Verify Success

After running the fix, you should see:

```
[0] VITE v5.4.19  ready in 142 ms
[0] ➜  Local:   http://localhost:3000/
[1] 🚀 ONVIF VMS Server running on port 3001
[1] 📊 Health check endpoint: http://localhost:3001/api/health
```

## If Issues Persist

1. **Clear npm cache:**
   ```bash
   npm cache clean --force
   ```

2. **Reinstall all dependencies:**
   ```bash
   rm -rf node_modules server/node_modules
   npm run install:all
   ```

3. **Check specific issues:**
   - Port conflicts: Change ports in `vite.config.js` and `server/index.js`
   - Permission errors: Use `sudo` on Linux/Mac if needed
   - Network issues: Ensure localhost access is allowed

## Test the Application

1. **Open browser:** http://localhost:3000
2. **Login with:** admin@local.test / admin123  
3. **Test camera discovery:** Click "Auto Discover"
4. **Verify styling:** UI should have proper colors and layout

The application should now be fully functional with both frontend and backend running correctly.