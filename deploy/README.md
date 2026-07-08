# Deployment & CI/CD Documentation

This project is configured for automated deployment (CI/CD) to a Hostinger VPS. Every push to the `main` branch undergoes automated testing and, if successful, triggers a secure deployment to the server.

---

## 🏗️ Architecture Overview

The application runs inside Docker containers via Docker Compose on the VPS:
- **Postgres**: Database service (internal network only, no exposed ports for security).
- **API**: NestJS backend service (internal network only, runs migrations on startup).
- **Web**: Nginx serving static Vite frontend files and reverse-proxying `/api` requests (exposes port `8080` to the host).
- **Nginx (VPS Host)**: Master reverse proxy listening on ports `80` and `443` to route traffic to the Docker container and manage SSL certificates.

---

## 🚀 Continuous Deployment (GitHub Actions)

We have added a `deploy` job in the [ci.yml](file:///c:/Users/soumi/Desktop/task-tracker-s47/.github/workflows/ci.yml) workflow. 

### Deployment Flow:
1. Code pushed to `main` branch.
2. GitHub runner spins up and runs test suite:
   - Typescript typechecks
   - Database migrations and seed verification
   - Unit tests
   - End-to-End smoke test
3. If all tests pass, the `deploy` job runs:
   - Uses `appleboy/ssh-action` to connect to the VPS via SSH.
   - Pulls the latest commits.
   - Rebuilds and starts the containers with zero-downtime recreation.

### Required GitHub Secrets:
To configure the connection, the following Secrets must be present in the GitHub repository (**Settings -> Secrets and variables -> Actions**):
- `VPS_HOST`: Public IP of the VPS (`187.127.185.82`).
- `VPS_USERNAME`: The SSH user (`deploy`).
- `VPS_SSH_KEY`: Private SSH key authorized on the VPS (`~/.ssh/github_actions_deploy`).
- `VPS_PORT`: SSH port (`22` or custom).

---

## 🔒 Host Nginx Reverse Proxy & SSL Setup

Since the VPS runs other live products, the host Nginx server manages port `80`/`443` traffic.

### 1. Site Configuration
File path on VPS: `/etc/nginx/sites-available/s47-task.duckdns.org`
```nginx
server {
    server_name s47-task.duckdns.org;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 2. Enabling and securing:
```bash
# Symlink site configuration
sudo ln -s /etc/nginx/sites-available/s47-task.duckdns.org /etc/nginx/sites-enabled/

# Verify config syntax & reload Nginx
sudo nginx -t
sudo systemctl reload nginx

# Run Certbot to generate/install Let's Encrypt SSL certificates
sudo certbot --nginx -d s47-task.duckdns.org
```

---

## ⚙️ Initial VPS Manual Setup
If you need to set up a new environment manually:

1. Clone using the SSH URL to utilize the server's Git deploy keys:
   ```bash
   git clone git@github.com:Studio-1947/task-tracker-s47.git /var/www/task-tracker-s47
   ```
2. Copy and configure the environment variables:
   ```bash
   cp .env.example .env
   nano .env # Set Database passwords, JWT keys, and domain CORS configurations
   ```
3. Run the initial build:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
4. Run the database seed script to set up the default administrator:
   ```bash
   docker compose -f docker-compose.prod.yml exec api node dist/database/seed.js
   ```

---

## 💾 Backups

Daily backups are handled via a Cron job calling `deploy/backup.sh`, which runs `pg_dump` and retains the last 14 days of data.

### Setup Backup Cron Job:
```bash
# Open crontab editor (runs daily at 02:30 AM)
crontab -e
30 2 * * * /var/www/task-tracker-s47/deploy/backup.sh >> /var/log/tt-backup.log 2>&1
```

### Restoring Database:
```bash
gunzip -c backups/task_tracker-YYYY-MM-DD.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```
