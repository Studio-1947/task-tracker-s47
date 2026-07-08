# Deployment (VPS)

Boring, single-VM deployment via Docker Compose. Postgres + API + web (nginx),
all on one internal Docker network; only the web container publishes a port.

## Prerequisites on the VPS

- Docker + Docker Compose plugin
- A domain pointing at the VPS (for TLS)
- Ports 80/443 open

## First deploy

```bash
git clone <your-repo> task-tracker && cd task-tracker
cp .env.example .env
# Edit .env — set STRONG secrets:
#   POSTGRES_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
#   COOKIE_DOMAIN=your.domain, CORS_ORIGIN=https://your.domain
# Generate secrets:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

docker compose -f docker-compose.prod.yml up -d --build

# Seed the first admin (uses SEED_ADMIN_* from .env). Migrations run automatically
# when the api container boots.
docker compose -f docker-compose.prod.yml exec api node dist/database/seed.js
```

The web container listens on `${WEB_PORT:-8080}`. Put a TLS terminator in front of it.

## TLS / reverse proxy

Simplest is Caddy on the host (automatic Let's Encrypt):

```
# /etc/caddy/Caddyfile
your.domain {
    reverse_proxy localhost:8080
}
```

Because the API sets `secure` cookies in production, **TLS is required** for login
to work in prod (the refresh cookie won't be sent over plain HTTP).

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
# migrations are applied automatically on api container start
```

## Backups (PRD §11.8)

`deploy/backup.sh` runs `pg_dump` against the compose Postgres and keeps the last
14 days. Wire it into cron on the host:

```bash
# crontab -e  — daily at 02:30
30 2 * * * /path/to/task-tracker/deploy/backup.sh >> /var/log/tt-backup.log 2>&1
```

Restore:

```bash
gunzip -c backups/task_tracker-YYYY-MM-DD.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

## Environments

- **dev** — `docker-compose.yml` (Postgres only) + `pnpm dev` on the host.
- **staging / prod** — `docker-compose.prod.yml`. Keep separate `.env` files (and
  ideally separate hosts). Never commit real secrets — only `.env.example` is tracked.
