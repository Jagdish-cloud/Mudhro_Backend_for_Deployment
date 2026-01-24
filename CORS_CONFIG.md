# CORS Configuration Guide

This guide explains how to configure CORS (Cross-Origin Resource Sharing) for your public-facing Mudhro FinTech application.

## Quick Setup

1. Create a `.env` file in the `backend` directory (if it doesn't exist)
2. Add the `ALLOWED_ORIGINS` configuration as shown below
3. Restart your server

## Configuration Options

### Option 1: Allow All Origins (Public-Facing API)

For truly public-facing APIs where you want to allow requests from any origin:

```env
ALLOWED_ORIGINS=*
```

**⚠️ Warning**: Use this option with caution. It allows any website to make requests to your API. Only use this if your API is designed to be completely public.

### Option 2: Whitelist Specific Domains (Recommended)

For better security, specify the exact domains that should be allowed to access your API:

```env
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com,https://app.yourdomain.com
```

**Best Practices:**
- Include both `http://` and `https://` versions if needed
- Include both `www` and non-`www` versions
- Include subdomains if your app uses them
- For development, include `http://localhost:5173` or your dev server URL

### Example Configurations

#### Single Domain (Production)
```env
ALLOWED_ORIGINS=https://mudhro.com
```

#### Multiple Domains (Production)
```env
ALLOWED_ORIGINS=https://mudhro.com,https://www.mudhro.com,https://app.mudhro.com
```

#### Development + Production
```env
ALLOWED_ORIGINS=https://mudhro.com,https://www.mudhro.com,http://localhost:5173,http://localhost:3000
```

#### Public API (All Origins)
```env
ALLOWED_ORIGINS=*
```

## Complete .env File Template

Create a `.env` file in the `backend` directory with the following content:

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# CORS Configuration
# For public-facing apps, use '*' or specify your domains
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-min-32-chars
JWT_EXPIRES_IN=2h
REFRESH_TOKEN_EXPIRES_IN=7d

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=Mudhro_FinTech
DB_USER=postgres
DB_PASSWORD=your-secure-password

# Rate Limiting
RATE_LIMIT_ENABLED=true
```

## How It Works

1. **Development Mode**: If `ALLOWED_ORIGINS` is not set, defaults to `http://localhost:5173,http://localhost:3000`

2. **Production Mode**: 
   - If `ALLOWED_ORIGINS` is set to `*`, all origins are allowed
   - If `ALLOWED_ORIGINS` contains specific domains, only those domains are allowed
   - If `ALLOWED_ORIGINS` is not set, the server will fail to start (security requirement)

3. **CORS Headers**: The server automatically sends appropriate CORS headers based on your configuration

## Testing CORS Configuration

After setting up your `.env` file, test the CORS configuration:

1. Start your server: `npm run dev` or `npm start`
2. Check the console output - it should show your CORS configuration
3. Make a request from your frontend and check the browser console for CORS errors
4. Check the server logs for any blocked CORS requests

## Troubleshooting

### "Not allowed by CORS" Error

If you see this error, it means the origin making the request is not in your `ALLOWED_ORIGINS` list:

1. Check your `.env` file has the correct `ALLOWED_ORIGINS` value
2. Ensure you've restarted the server after changing `.env`
3. Verify the exact origin in the browser's Network tab
4. Add the missing origin to your `ALLOWED_ORIGINS` list

### Development Issues

If you're having issues in development:
- Make sure `http://localhost:5173` (or your dev server port) is in the list
- Or use `ALLOWED_ORIGINS=*` for development only

### Production Security

For production:
- **Never** use `ALLOWED_ORIGINS=*` unless absolutely necessary
- Always specify exact domains
- Use HTTPS for all production domains
- Regularly review and update your allowed origins list

## Security Notes

- The `.env` file is already in `.gitignore` - never commit it to version control
- CORS is a browser security feature - it doesn't prevent server-to-server requests
- Always use HTTPS in production
- Consider using a reverse proxy (like Nginx) for additional security layers

## Need Help?

If you're unsure which configuration to use:
- For a public API that anyone can access: Use `ALLOWED_ORIGINS=*`
- For a web application with a known frontend: Whitelist your specific domains
- For development: Use the default or add `http://localhost:YOUR_PORT`

