/**
 * Helper script to find your local IP address
 * Run: npm run get-ip (or tsx src/scripts/get-local-ip.ts)
 */

import os from 'os';

function getLocalIP(): string | null {
  const interfaces = os.networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    const networkInterface = interfaces[name];
    if (!networkInterface) continue;
    
    for (const iface of networkInterface) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  
  return null;
}

const localIP = getLocalIP();

if (localIP) {
  console.log('\n✅ Your local IP address is:', localIP);
  console.log('\n📱 Use these URLs to access from mobile device:');
  console.log(`   Frontend: http://${localIP}:8080`);
  console.log(`   Backend:  http://${localIP}:3000`);
  console.log('\n💡 Set this in your frontend .env file:');
  console.log(`   VITE_API_URL=http://${localIP}:3000\n`);
} else {
  console.error('❌ Could not find local IP address. Make sure you are connected to a network.');
  process.exit(1);
}

