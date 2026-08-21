# Deployment Guide

How the Doptor super-app is deployed, how to reproduce it on a fresh server, and
how to apply the same pattern to a brand-new project. Written from the actual
deployment journey, including the mistakes and fixes so you don't repeat them.

---

## 1. Architecture at a glance

```
                        Internet (443/80)
                              │
                    ┌─────────▼──────────┐
                    │   HOST nginx       │  ← already on the VPS, also serves
                    │  (reverse proxy)   │    OTHER live sites. Never disturb it.
                    └───┬────────────┬───┘
       dev.doptor.in    │            │   api.dev.doptor.in
                        ▼            ▼
              127.0.0.1:3000   127.0.0.1:5000
                 (web)             (api)
                    │                │
                    │      docker compose (internal network)
                    │                │
                    └──── postgres ──┘   (not exposed to host)
```

- **Repo location on VPS:** `/var/www/Doptor-super-app-monorepo`
- **Server:** Hostinger VPS `187.127.185.82`, Debian, SSH user `deploy`
  (member of the `docker` group).
- **Stack:** pnpm + Turborepo monorepo. Backend = NestJS (port 5000),
  Frontend = Next.js standalone (port 3000), DB = Postgres 16.
- **Containers** bind to `127.0.0.1` only; the **host nginx** terminates TLS and
  reverse-proxies to them. This lets Doptor coexist with other sites on the same
  server.
- **TLS:** Let's Encrypt via certbot (`--nginx`), auto-renewing.
- **CI/CD:** GitHub Actions auto-deploys on push to `main`.

### Key files (all in the repo)
| File | Purpose |
|---|---|
| `backend/api/Dockerfile` | Builds the NestJS API (pnpm + turbo prune) |
| `frontend/web/Dockerfile` | Builds the Next.js app (standalone output) |
| `docker-compose.prod.yml` | postgres + api + web, localhost-bound ports |
| `deploy/nginx/doptor-dev.conf` | Host nginx reverse-proxy config |
| `.env.prod.example` | Template for the production `.env` |
| `.github/workflows/deploy.yml` | Auto-deploy on push to `main` |

---

## 2. Day-to-day workflow (once set up)

```bash
# On your PC:
git add -A && git commit -m "..." && git push
```
Pushing to `main` triggers GitHub Actions → SSHes into the VPS →
`git pull` + `docker compose -f docker-compose.prod.yml up -d --build`.
Watch it in the repo's **Actions** tab (~2–4 min).

**Database migrations are NOT automated** (deliberate — a stray push must never
alter the DB). When the schema changes, run once on the VPS:
```bash
cd /var/www/Doptor-super-app-monorepo
docker compose -f docker-compose.prod.yml exec api \
  sh -c "cd backend/api && npx drizzle-kit push:pg"
```

Manual deploy (if you ever need it, e.g. Actions is down):
```bash
cd /var/www/Doptor-super-app-monorepo
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Useful checks:
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs api  --tail=50
docker compose -f docker-compose.prod.yml logs web  --tail=50
```

---

## 3. Deploy THIS project on a fresh VPS (from zero)

### 3.1 Server prep (as root or a sudo user)
```bash
apt update && apt upgrade -y
apt install -y git ufw
curl -fsSL https://get.docker.com | sh          # skip if docker already present
# firewall (only if the provider doesn't manage one):
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
```

Create/confirm a deploy user in the `docker` group:
```bash
usermod -aG docker deploy      # then that user must log out & back in
```

### 3.2 Get the code
```bash
cd /var/www          # or wherever you keep sites
git clone https://github.com/Studio-1947/Doptor-super-app-monorepo.git
cd Doptor-super-app-monorepo
```

### 3.3 Production env
```bash
cp .env.prod.example .env
nano .env
```
Set at minimum:
- `POSTGRES_PASSWORD` — strong password
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — each `openssl rand -base64 48`
- `FRONTEND_URL=https://<your-frontend-domain>`
- `NEXT_PUBLIC_API_URL=https://<your-api-domain>`

### 3.4 Build & run
```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps          # all Up
curl -I http://127.0.0.1:3000                          # web → 200
curl -I http://127.0.0.1:5000/api-docs                 # api → 200
```

### 3.5 DNS
Point the two domains at the server IP (A records). If the domain's nameservers
are elsewhere (e.g. Vercel), add the records **there**, not at the registrar.
Verify:
```bash
dig @8.8.8.8 <frontend-domain> +short   # must print the server IP
dig @8.8.8.8 <api-domain> +short        # must print the server IP
```

### 3.6 Host nginx + TLS
```bash
# adjust server_name lines in the config to your domains first
sudo cp deploy/nginx/doptor-dev.conf /etc/nginx/sites-available/doptor-dev.conf
sudo ln -sf /etc/nginx/sites-available/doptor-dev.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <frontend-domain> -d <api-domain>   # choose Redirect
```

### 3.7 Schema + verify
```bash
docker compose -f docker-compose.prod.yml exec api \
  sh -c "cd backend/api && npx drizzle-kit push:pg"
```
Open the frontend URL, then register/login while watching DevTools → Network to
confirm API calls hit the api domain and succeed (no CORS errors).

### 3.8 Auto-deploy (one-time)
On the VPS, create a deploy key:
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/gh_deploy -N ""
cat ~/.ssh/gh_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/gh_deploy        # copy the FULL private key (BEGIN..END)
```
In GitHub → repo → Settings → Secrets and variables → Actions, add:
- `VPS_HOST` = server IP
- `VPS_USER` = `deploy`
- `SSH_PRIVATE_KEY` = the full private key

Push `main` and watch the **Actions** tab.

---

## 4. Playbook for a BRAND-NEW project on this same server

The whole point of the localhost-bound + host-nginx pattern is that **many apps
coexist** on one VPS. To add another project (`myapp`):

1. **Containerize it** with a `docker-compose.prod.yml` that binds each service to
   a **unique** localhost port (e.g. web `127.0.0.1:3100`, api `127.0.0.1:5100`).
   Never publish `0.0.0.0` ports and never map 80/443 — the host nginx owns those.
2. **Clone it** to `/var/www/myapp` and create its `.env`.
3. `docker compose -f docker-compose.prod.yml up -d --build`.
4. **DNS:** add A records for its domains → the same server IP.
5. **nginx:** create `/etc/nginx/sites-available/myapp.conf` (copy the Doptor one,
   change `server_name` + the `proxy_pass` ports), symlink into `sites-enabled`,
   `nginx -t`, reload.
6. **TLS:** `certbot --nginx -d ... -d ...`.
7. **CI/CD:** copy `.github/workflows/deploy.yml`, change the `cd` path and the
   deploy secrets if it's a different repo.

Rules that keep everything from colliding:
- One host nginx = the single front door on 80/443.
- Each app: unique localhost ports, its own compose project name / container
  names, its own `/var/www/<app>` dir.
- Each app: its own nginx server block (never set `default_server`, so existing
  sites are untouched).
- Postgres: give each app its own DB container (or its own DB/user inside a shared
  one). Don't expose it to the host.

---

## 5. Troubleshooting — real issues we hit and the fixes

**`turbo prune` build fails: `Cannot read file '/app/tsconfig.base.json'`**
The root tsconfig isn't included in the pruned image. Fix (already in
`frontend/web/Dockerfile`): `COPY --from=pruner /app/tsconfig.base.json ./`.

**API build fails: `Cannot find module 'dotenv'` in `seed.ts`**
The standalone seed script imports a dep that isn't installed. It's excluded from
the build in `backend/api/tsconfig.json` (`exclude: [... "src/database/drizzle/seed.ts"]`).
If you ever need `db:seed`, add `dotenv` to the backend deps first.

**API container crash-loops: `Cannot find module '/app/backend/api/dist/main.js'`**
`nest build` emitted to `dist/src/main.js` because a stray `.ts` (`drizzle.config.ts`)
sitting next to `src/` shifted the compile root. Fixed by pinning the build to
`src` in `backend/api/tsconfig.json`: `"rootDir": "./src"` + `"include": ["src/**/*"]`.

**Caddy/nginx can't bind port 80: `address already in use`**
Another web server already owns 80/443. Don't fight it — bind the app containers
to `127.0.0.1` and reverse-proxy through the existing host nginx (this is the
architecture we settled on).

**`docker ps` → permission denied on docker.sock**
The user isn't in the `docker` group: `sudo usermod -aG docker <user>`, then log
out and back in (group changes only apply on a fresh login). Or prefix with `sudo`.

**certbot fails with DNS `SERVFAIL`**
The domain's nameservers aren't answering. We hit this hard with DuckDNS (chronic
SERVFAILs) and switched to a real domain (`doptor.in`, Vercel-managed DNS). Verify
with `dig @8.8.8.8 <domain> +short` — it must return the server IP with no
SERVFAIL before running certbot.

**Placeholders bite.** `YOUR_VPS_IP`, `YOUR_DUCKDNS_TOKEN`, `example.com` etc. must
be replaced with real values in every command. A failed `ssh` to a placeholder host
means the rest of your pasted block runs on your **local** machine.

**Frontend calls the wrong API URL after a domain change.**
`NEXT_PUBLIC_API_URL` is compiled into the web bundle at **build** time. Changing
it requires a rebuild (`up -d --build`), not just a restart. Also update
`FRONTEND_URL` (API CORS is locked to it) or the browser gets CORS errors.

---

## 6. Environment variables reference

`.env` (consumed by `docker-compose.prod.yml`):

| Var | Example | Notes |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `doptor` / *(secret)* / `doptor` | Postgres container |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | *(openssl rand -base64 48)* | Auth |
| `FRONTEND_URL` | `https://dev.doptor.in` | API CORS origin + email links |
| `NEXT_PUBLIC_API_URL` | `https://api.dev.doptor.in` | **Baked into web at build time** |
| `EMAIL_*` | Gmail SMTP | Optional |

The API listens on port **5000** in production (set via `PORT` in the compose
`api` service; must match the `proxy_pass` port in the nginx config).
