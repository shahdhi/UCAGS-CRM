# UCAGS CRM - Deployment Guide

This guide covers deploying the UCAGS CRM system to a production environment.

## Table of Contents
1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Server Requirements](#server-requirements)
3. [Deployment Options](#deployment-options)
4. [Production Configuration](#production-configuration)
5. [Security Hardening](#security-hardening)
6. [Monitoring & Maintenance](#monitoring--maintenance)
7. [Backup Strategy](#backup-strategy)

---

## 1. Pre-Deployment Checklist

Before deploying to production, ensure you have:

- [ ] Completed all setup steps from SETUP.md
- [ ] Tested the application locally
- [ ] Changed default admin password
- [ ] Generated secure session secret
- [ ] Configured SSL/TLS certificate
- [ ] Set up domain name
- [ ] Configured firewall rules
- [ ] Set up monitoring tools
- [ ] Created backup procedures
- [ ] Documented admin credentials securely

---

## 2. Server Requirements

### Minimum Requirements
- **CPU**: 2 cores
- **RAM**: 2GB
- **Storage**: 10GB SSD
- **OS**: Ubuntu 20.04+ or Windows Server 2019+
- **Node.js**: v14.x or higher
- **Network**: Static IP address

### Recommended Requirements
- **CPU**: 4 cores
- **RAM**: 4GB
- **Storage**: 20GB SSD
- **OS**: Ubuntu 22.04 LTS
- **Node.js**: v18.x LTS
- **Network**: Static IP with CDN

---

## 3. Deployment Options

### Option A: Traditional VPS/Cloud Server (Recommended)

#### Providers
- **DigitalOcean**: Droplets ($10-20/month)
- **AWS EC2**: t3.small or t3.medium
- **Google Cloud**: e2-small or e2-medium
- **Linode**: Shared CPU 2GB or 4GB
- **Vultr**: Cloud Compute instances

#### Ubuntu Server Deployment

##### Step 1: Prepare Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install build tools
sudo apt install -y build-essential

# Install Git
sudo apt install -y git

# Install Nginx (reverse proxy)
sudo apt install -y nginx

# Install PM2 (process manager)
sudo npm install -g pm2
```

##### Step 2: Deploy Application

```bash
# Create application directory
sudo mkdir -p /var/www/ucags-crm
sudo chown $USER:$USER /var/www/ucags-crm

# Clone or upload application
cd /var/www/ucags-crm
# Upload your files or git clone

# Install dependencies
npm install --production

# Create .env file
nano .env
# Paste your production environment variables

# Set proper permissions
chmod 600 .env
```

##### Step 3: Configure PM2

```bash
# Start application with PM2
pm2 start server/index.js --name ucags-crm

# Save PM2 configuration
pm2 save

# Set PM2 to start on boot
pm2 startup
# Follow the instructions shown

# Check status
pm2 status
pm2 logs ucags-crm
```

##### Step 4: Configure Nginx

```bash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/ucags-crm
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name crm.ucags.edu.lk;

    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/ucags-crm /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

##### Step 5: Set Up SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d crm.ucags.edu.lk

# Test automatic renewal
sudo certbot renew --dry-run
```

##### Step 6: Configure Firewall

```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow ssh

# Allow HTTP and HTTPS
sudo ufw allow 'Nginx Full'

# Check status
sudo ufw status
```

### Option B: Heroku Deployment

```bash
# Install Heroku CLI
# Visit: https://devcenter.heroku.com/articles/heroku-cli

# Login to Heroku
heroku login

# Create new app
heroku create ucags-crm

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set SESSION_SECRET=your-secret
heroku config:set GOOGLE_SERVICE_ACCOUNT_EMAIL=your-email
heroku config:set GOOGLE_PRIVATE_KEY="your-private-key"
heroku config:set ADMIN_SHEET_ID=your-sheet-id
# ... (set all environment variables)

# Deploy
git push heroku main

# Open application
heroku open
```

### Option C: Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server/index.js"]
```

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  ucags-crm:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    restart: unless-stopped
    volumes:
      - ./logs:/app/logs
```

Deploy:

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

---

## 4. Production Configuration

### Environment Variables

Update `.env` for production:

```env
# Server Configuration
PORT=3000
NODE_ENV=production
SESSION_SECRET=your-64-char-random-secret-here

# Google Service Account
GOOGLE_SERVICE_ACCOUNT_EMAIL=ucags-crm-service@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Google Sheets Configuration
ADMIN_SHEET_ID=your-production-sheet-id
ADMIN_SHEET_NAME=Admin

# Gmail Configuration
GMAIL_USER=admissions@ucags.edu.lk
GMAIL_DELEGATED_USER=admissions@ucags.edu.lk

# Google Calendar Configuration
CALENDAR_ID=primary

# Twilio Configuration (if using)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=your-phone-number

# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$2a$10$hashed_password_here

# Application URL
APP_URL=https://crm.ucags.edu.lk
```

### Session Configuration

For production, configure secure sessions in `server/index.js`:

```javascript
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: true,  // Requires HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'strict'
  }
}));
```

---

## 5. Security Hardening

### A. Server Security

```bash
# Disable root login
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no

# Set up fail2ban
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Automatic security updates
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### B. Application Security

1. **Use Strong Passwords**
   - Minimum 12 characters
   - Mix of uppercase, lowercase, numbers, symbols
   - Use bcrypt for hashing

2. **Secure Environment Variables**
   ```bash
   chmod 600 .env
   chown www-data:www-data .env
   ```

3. **Enable HTTPS Only**
   - Force HTTPS redirects in Nginx
   - Set secure cookie flag

4. **Rate Limiting**
   
   Install express-rate-limit:
   ```bash
   npm install express-rate-limit
   ```

   Add to `server/index.js`:
   ```javascript
   const rateLimit = require('express-rate-limit');

   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100 // limit each IP to 100 requests per windowMs
   });

   app.use('/api/', limiter);
   ```

5. **CORS Configuration**
   ```javascript
   const cors = require('cors');
   
   app.use(cors({
     origin: 'https://ucags.edu.lk',
     credentials: true
   }));
   ```

### C. Google Security

1. **Rotate Service Account Keys** (every 90 days)
2. **Monitor API Usage** in Google Cloud Console
3. **Set Up Alerts** for suspicious activity
4. **Use Least Privilege** - only grant necessary permissions

---

## 6. Monitoring & Maintenance

### Application Monitoring

```bash
# View PM2 logs
pm2 logs ucags-crm

# Monitor resources
pm2 monit

# View detailed info
pm2 show ucags-crm

# Restart application
pm2 restart ucags-crm

# Reload (zero-downtime)
pm2 reload ucags-crm
```

### Log Management

Create log rotation configuration:

```bash
sudo nano /etc/logrotate.d/ucags-crm
```

```
/var/www/ucags-crm/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

### Health Checks

Set up uptime monitoring:
- **UptimeRobot**: https://uptimerobot.com (Free)
- **Pingdom**: https://www.pingdom.com
- **StatusCake**: https://www.statuscake.com

### Performance Monitoring

```bash
# Install monitoring tools
npm install --save prom-client

# Set up monitoring endpoints in server/index.js
```

---

## 7. Backup Strategy

### A. Google Sheets Backup

Create automated backups:

```javascript
// Add to google-apps-script.js

function backupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const backupFolder = DriveApp.getFolderById('YOUR_BACKUP_FOLDER_ID');
  
  const date = Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM-dd');
  const fileName = 'UCAGS_CRM_Backup_' + date;
  
  ss.makeCopy(fileName, backupFolder);
  
  Logger.log('Backup created: ' + fileName);
}

// Set up daily trigger for this function
```

### B. Database Export

Create a backup endpoint:

```javascript
// server/routes/backup.js
router.get('/export', isAdmin, async (req, res) => {
  try {
    const enquiries = await sheetsService.getAllEnquiries();
    res.json({ data: enquiries, timestamp: new Date() });
  } catch (error) {
    res.status(500).json({ error: 'Backup failed' });
  }
});
```

### C. Automated Backup Script

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/ucags-crm"
APP_DIR="/var/www/ucags-crm"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup application files
tar -czf $BACKUP_DIR/app_$DATE.tar.gz $APP_DIR

# Backup environment file
cp $APP_DIR/.env $BACKUP_DIR/env_$DATE

# Keep only last 30 days
find $BACKUP_DIR -type f -mtime +30 -delete

echo "Backup completed: $DATE"
```

Set up cron job:

```bash
# Run daily at 2 AM
crontab -e
# Add: 0 2 * * * /path/to/backup.sh
```

---

## 8. Updates & Maintenance

### Updating the Application

```bash
# Pull latest changes
cd /var/www/ucags-crm
git pull origin main

# Install new dependencies
npm install --production

# Reload application
pm2 reload ucags-crm

# Check status
pm2 status
```

### Database Migrations

When updating Google Sheets structure:

1. Add new columns to the right of existing ones
2. Update `ADMIN_COLUMNS` in `server/integrations/sheets.js`
3. Test thoroughly before deploying
4. Update all officer sheets with new structure

---

## 9. Troubleshooting Production Issues

### Application Won't Start

```bash
# Check PM2 logs
pm2 logs ucags-crm --lines 100

# Check system logs
sudo journalctl -u nginx -n 50

# Verify Node.js version
node --version

# Test configuration
node -c server/index.js
```

### High Memory Usage

```bash
# Check memory
free -h

# Restart application
pm2 restart ucags-crm

# Increase Node.js memory limit
pm2 delete ucags-crm
pm2 start server/index.js --name ucags-crm --max-memory-restart 500M
```

### Slow Performance

1. Check Google API quotas
2. Monitor network latency
3. Optimize database queries
4. Enable caching
5. Use CDN for static files

---

## 10. Production Checklist

Before going live:

- [ ] SSL certificate installed and working
- [ ] All environment variables set correctly
- [ ] Firewall configured properly
- [ ] PM2 configured for auto-restart
- [ ] Nginx reverse proxy working
- [ ] Monitoring tools set up
- [ ] Backup procedures in place
- [ ] Admin password changed
- [ ] Test all features end-to-end
- [ ] Document all credentials securely
- [ ] Train staff on system usage
- [ ] Set up support procedures

---

## Support & Maintenance

For production support:
- **Email**: it-support@ucags.edu.lk
- **Emergency**: [Contact number]
- **Documentation**: https://crm.ucags.edu.lk/docs

---

**Production Deployment Complete!** 🚀

Your UCAGS CRM system is now live and ready for production use.
