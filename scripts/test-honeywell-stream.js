#!/usr/bin/env node

console.log('🎥 Testing Honeywell Camera Stream URLs...\n');

const testUrls = [
  // Honeywell/Hikvision specific URLs
  'http://192.168.226.201/ISAPI/Streaming/channels/101/picture',
  'http://192.168.226.201/ISAPI/Streaming/channels/1/picture', 
  'http://192.168.226.201/ISAPI/Streaming/channels/101/httppreview',
  'http://192.168.226.201/cgi-bin/mjpg/video.cgi?channel=1&subtype=1',
  'http://192.168.226.201/streaming/channels/1/picture',
  'http://192.168.226.201/streaming/channels/101/picture',
  
  // Generic MJPEG URLs
  'http://192.168.226.201/mjpeg/1',
  'http://192.168.226.201/video.mjpg',
  'http://192.168.226.201/mjpeg',
  'http://192.168.226.201/cgi-bin/mjpg/video.cgi',
  
  // Snapshot URLs
  'http://192.168.226.201/jpg/image.jpg',
  'http://192.168.226.201/snapshot.jpg',
  'http://192.168.226.201/cgi-bin/snapshot.cgi',
  'http://192.168.226.201/ISAPI/Streaming/channels/1/picture',
  
  // Web Interface
  'http://192.168.226.201:80',
  'http://192.168.226.201',
  
  // RTSP URLs (for reference)
  'rtsp://192.168.226.201:554/Streaming/Channels/101',
  'rtsp://192.168.226.201:554/Streaming/Channels/1',
  'rtsp://192.168.226.201:554/live',
  'rtsp://192.168.226.201:554/onvif1'
];

async function testStreamUrl(url, credentials = null) {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({ success: false, error: 'Timeout' });
    }, 5000);

    try {
      if (url.startsWith('rtsp://')) {
        clearTimeout(timeoutId);
        resolve({ success: false, error: 'RTSP requires media player' });
        return;
      }

      const testUrl = credentials 
        ? url.replace('://', `://${credentials.username}:${credentials.password}@`)
        : url;

      fetch(testUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'ONVIF-VMS-Test/1.0'
        }
      }).then(response => {
        clearTimeout(timeoutId);
        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          resolve({ 
            success: true, 
            status: response.status,
            contentType: contentType,
            isImage: contentType.includes('image'),
            isMjpeg: contentType.includes('mjpeg') || contentType.includes('multipart')
          });
        } else {
          resolve({ 
            success: false, 
            status: response.status,
            error: `HTTP ${response.status}`
          });
        }
      }).catch(error => {
        clearTimeout(timeoutId);
        resolve({ 
          success: false, 
          error: error.message.includes('fetch') ? 'Connection failed' : error.message
        });
      });
    } catch (error) {
      clearTimeout(timeoutId);
      resolve({ success: false, error: error.message });
    }
  });
}

async function runTests() {
  console.log('🔧 Testing URLs without authentication first...\n');
  
  let workingUrls = [];
  
  for (let i = 0; i < testUrls.length; i++) {
    const url = testUrls[i];
    const testNum = `${i + 1}`.padStart(2, '0');
    
    process.stdout.write(`${testNum}. Testing: ${url} ... `);
    
    const result = await testStreamUrl(url);
    
    if (result.success) {
      console.log(`✅ SUCCESS (${result.status}) - ${result.contentType}`);
      workingUrls.push({ url, result });
      
      if (result.isImage || result.isMjpeg) {
        console.log(`    📸 This appears to be a ${result.isMjpeg ? 'MJPEG stream' : 'static image'}`);
      }
    } else if (result.status === 401) {
      console.log(`🔐 NEEDS AUTH (401) - Try with credentials`);
      workingUrls.push({ url, result, needsAuth: true });
    } else {
      console.log(`❌ FAILED - ${result.error}`);
    }
  }
  
  console.log(`\n📊 SUMMARY:`);
  console.log(`==================`);
  console.log(`Total URLs tested: ${testUrls.length}`);
  console.log(`Working URLs: ${workingUrls.filter(u => u.result.success).length}`);
  console.log(`Need authentication: ${workingUrls.filter(u => u.needsAuth).length}`);
  console.log(`Failed: ${testUrls.length - workingUrls.length}`);
  
  if (workingUrls.length > 0) {
    console.log(`\n✅ WORKING URLS:`);
    workingUrls.forEach((item, index) => {
      if (item.result.success) {
        console.log(`${index + 1}. ${item.url}`);
        console.log(`   Type: ${item.result.contentType}`);
        console.log(`   Recommended for: ${item.result.isMjpeg ? 'Live streaming' : 'Snapshots'}`);
      }
    });
  }
  
  if (workingUrls.filter(u => u.needsAuth).length > 0) {
    console.log(`\n🔐 URLS THAT NEED AUTHENTICATION:`);
    workingUrls.filter(u => u.needsAuth).forEach((item, index) => {
      console.log(`${index + 1}. ${item.url}`);
    });
    
    console.log(`\n💡 To test with authentication, use credentials in the VMS application:`);
    console.log(`   Username: admin (or camera username)`);
    console.log(`   Password: your camera password`);
  }
  
  console.log(`\n🎯 RECOMMENDATIONS:`);
  console.log(`==================`);
  
  const mjpegUrls = workingUrls.filter(u => u.result.success && u.result.isMjpeg);
  const imageUrls = workingUrls.filter(u => u.result.success && u.result.isImage && !u.result.isMjpeg);
  const authUrls = workingUrls.filter(u => u.needsAuth);
  
  if (mjpegUrls.length > 0) {
    console.log(`📹 Best for live streaming: ${mjpegUrls[0].url}`);
  }
  
  if (imageUrls.length > 0) {
    console.log(`📸 Best for snapshots: ${imageUrls[0].url}`);
  }
  
  if (authUrls.length > 0) {
    console.log(`🔐 Try with authentication: ${authUrls[0].url}`);
  }
  
  if (workingUrls.length === 0) {
    console.log(`❌ No working URLs found. Camera may require authentication or different URLs.`);
    console.log(`\n🔧 TROUBLESHOOTING:`);
    console.log(`• Make sure camera is accessible at 192.168.226.201`);
    console.log(`• Check if camera requires authentication`);
    console.log(`• Verify camera is Honeywell/Hikvision compatible`);
    console.log(`• Try accessing camera web interface directly`);
  }
}

runTests().catch(console.error);