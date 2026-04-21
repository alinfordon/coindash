# NEXUS TRADE — Linux Self-Hosting Guide

Acest ghid explică cum să rulezi **NEXUS TRADE** pe un server Linux (Ubuntu/Debian) cu cron-uri native, astfel încât cele două joburi (`analysis` la 15 min, `positions` la 5 min) să ruleze independent de viața aplicației Next.js.

---

## 0. Cerințe

| Component  | Versiune minimă | Notă                                        |
|------------|-----------------|---------------------------------------------|
| Node.js    | 20.x LTS        | `nvm install 20 && nvm use 20`              |
| MongoDB    | 6.x             | Local sau Atlas                             |
| systemd    | —               | Pentru serviciu permanent                   |
| cron       | —               | `sudo apt install cron` (de obicei prezent) |
| git        | orice           | Pentru clonare                              |

```bash
sudo apt update && sudo apt install -y git curl build-essential cron
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## 1. Cum funcționează cron-ul în NEXUS TRADE

Aplicația expune **două endpoint-uri idempotente** care execută sincron logica de cron:

| Endpoint                         | Ce face                                              | Recomandare |
|----------------------------------|------------------------------------------------------|-------------|
| `POST /api/cron/analysis`        | Scanează top 50 perechi USDC, rulează analiza AI, deschide trade-uri candidate | la 15 min   |
| `POST /api/cron/positions`       | Trece prin toate pozițiile OPEN, verifică TP/SL, rulează AI check, închide dacă e cazul | la 5 min    |

Ambele verifică `pilotActive` / `analysisCronActive` / `positionCheckCronActive` din settings. **Dacă oprești AI Pilot din UI, cron-urile se auto-skip-uiesc** chiar dacă Linux-ul le apelează — nu e nevoie să modifici crontab-ul ca să pui pe pauză.

### Autentificare pentru cron

Rutele `/api/cron/*` sunt scutite de middleware-ul NextAuth (altfel curl-ul din crontab ar primi `401 Unauthorized`). Opțional poți seta `CRON_SECRET` în `.env.local` și atunci endpoint-urile cer header-ul:

```
Authorization: Bearer <CRON_SECRET>
```

Dacă `CRON_SECRET` e gol, endpoint-urile sunt deschise — sigur doar dacă Next.js ascultă pe `127.0.0.1` (vezi și nota de mai jos).

---

## 2. Deploy rapid (5 pași)

```bash
# 1. Clonează pe server
cd /opt
sudo git clone <repo-url> nexus-trade
sudo chown -R $USER:$USER nexus-trade
cd nexus-trade

# 2. Install + build
npm install --legacy-peer-deps
cp .env.local.example .env.local
nano .env.local                        # completează MONGODB_URI, ENCRYPTION_KEY etc.
npm run build

# 3. Pornește Next.js ca serviciu systemd (vezi secțiunea 3)
# 4. Adaugă cron-urile (vezi secțiunea 4)
# 5. Deschide http://<server>:3000/settings și introdu cheile Binance + AI
```

---

## 3. Serviciu systemd pentru Next.js

Salvează ca `/etc/systemd/system/nexus-trade.service`:

```ini
[Unit]
Description=NEXUS TRADE - AI Crypto Dashboard
After=network.target mongod.service

[Service]
Type=simple
User=nexus
WorkingDirectory=/opt/nexus-trade
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/opt/nexus-trade/.env.local
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -p 3000
Restart=always
RestartSec=5
StandardOutput=append:/var/log/nexus-trade/app.log
StandardError=append:/var/log/nexus-trade/app.err

[Install]
WantedBy=multi-user.target
```

Creează utilizatorul dedicat și directorul de log:

```bash
sudo useradd --system --home /opt/nexus-trade --shell /usr/sbin/nologin nexus
sudo chown -R nexus:nexus /opt/nexus-trade
sudo mkdir -p /var/log/nexus-trade
sudo chown nexus:nexus /var/log/nexus-trade

sudo systemctl daemon-reload
sudo systemctl enable --now nexus-trade
sudo systemctl status nexus-trade
```

Urmărește log-urile live:

```bash
journalctl -u nexus-trade -f
# sau
tail -f /var/log/nexus-trade/app.log
```

---

## 4. Cron jobs (Linux crontab)

Există două abordări — alege una.

### Abordarea A (RECOMANDAT): curl către API-ul local

Cel mai simplu. Cron-ul doar lovește endpoint-urile HTTP ale aplicației.

```bash
sudo -u nexus crontab -e
```

Adaugă:

```cron
# ===== NEXUS TRADE =====
# PATH must include /usr/bin for curl
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Analysis cron — every 15 minutes
*/15 * * * * curl -fsS -X POST http://127.0.0.1:3000/api/cron/analysis >> /var/log/nexus-trade/cron-analysis.log 2>&1

# Position check cron — every 5 minutes
*/5  * * * * curl -fsS -X POST http://127.0.0.1:3000/api/cron/positions >> /var/log/nexus-trade/cron-positions.log 2>&1

# Dacă ai setat CRON_SECRET în .env.local, adaugă header-ul:
# */5 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/positions ...
# (în crontab $CRON_SECRET nu e expandat automat — fie îl scrii pe bune în linie, fie îl iei dintr-un wrapper script care face `source /opt/nexus-trade/.env.local`.)

# Optional: log rotation marker (weekly)
0 3 * * 0 echo "---- rotate $(date -Iseconds) ----" >> /var/log/nexus-trade/cron-analysis.log
```

Apoi asigură-te că user-ul `nexus` poate scrie în log:

```bash
sudo touch /var/log/nexus-trade/cron-analysis.log /var/log/nexus-trade/cron-positions.log
sudo chown nexus:nexus /var/log/nexus-trade/cron-*.log
```

**Verifică rapid că merge:**

```bash
curl -X POST http://127.0.0.1:3000/api/cron/analysis
# răspuns: {"analyzed":41,"opened":0,"reason":"...","distribution":{...}}
```

### Abordarea B: Apel direct din linia de comandă

Dacă nu vrei să rulezi Next.js ca serviciu HTTP sau vrei cron fără HTTP overhead, folosește workerul standalone inclus:

```cron
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/nexus/.nvm/versions/node/v20/bin

# Un singur proces care rulează ambele cron-uri în interior (node-cron)
@reboot cd /opt/nexus-trade && /usr/bin/node --env-file=.env.local scripts/worker.mjs >> /var/log/nexus-trade/worker.log 2>&1
```

Notă: workerul din `scripts/worker.mjs` are fallback HTTP — dacă nu poate încărca bundle-ul `.next/server/...`, face fallback la `POST` către `http://localhost:3000/api/cron/...`. Practic = Abordarea A, dar pornită automat.

### Abordarea C: systemd timers (alternativă la crontab)

Mai "cloud-native" decât cron-ul clasic. Două perechi de fișiere.

`/etc/systemd/system/nexus-analysis.service`:

```ini
[Unit]
Description=NEXUS TRADE Analysis cron
After=nexus-trade.service
Requires=nexus-trade.service

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -fsS -X POST http://127.0.0.1:3000/api/cron/analysis
```

`/etc/systemd/system/nexus-analysis.timer`:

```ini
[Unit]
Description=Run NEXUS TRADE analysis every 15 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
AccuracySec=30s
Unit=nexus-analysis.service

[Install]
WantedBy=timers.target
```

`/etc/systemd/system/nexus-positions.service`:

```ini
[Unit]
Description=NEXUS TRADE Positions cron
After=nexus-trade.service
Requires=nexus-trade.service

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -fsS -X POST http://127.0.0.1:3000/api/cron/positions
```

`/etc/systemd/system/nexus-positions.timer`:

```ini
[Unit]
Description=Run NEXUS TRADE position check every 5 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min
AccuracySec=15s
Unit=nexus-positions.service

[Install]
WantedBy=timers.target
```

Activează:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nexus-analysis.timer nexus-positions.timer
systemctl list-timers | grep nexus
```

---

## 5. Schema recomandată de deploy

```
  ┌────────────────┐         ┌───────────────────────────┐
  │   nginx 443    │ ──HTTPS─▶  nexus-trade (systemd)    │
  │  (reverse px)  │         │  Next.js on :3000         │
  └────────┬───────┘         └────────────┬──────────────┘
           │                              │
           │                              ├──▶ MongoDB (local sau Atlas)
           ▼                              │
  (certbot/LE)                            ├──▶ Binance REST (testnet/live)
                                          │
                                          └──▶ Anthropic / Google / Ollama
  ┌─────────────────┐
  │ cron(8)         │  ── 15 min ──▶ POST /api/cron/analysis
  │ sau timers      │  ──  5 min ──▶ POST /api/cron/positions
  └─────────────────┘
```

---

## 6. nginx + HTTPS (opțional dar recomandat)

`/etc/nginx/sites-available/nexus-trade`:

```nginx
server {
    listen 80;
    server_name trade.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name trade.example.com;

    ssl_certificate     /etc/letsencrypt/live/trade.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/trade.example.com/privkey.pem;

    client_max_body_size 2m;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/nexus-trade /etc/nginx/sites-enabled/
sudo certbot --nginx -d trade.example.com
sudo nginx -t && sudo systemctl reload nginx
```

Dacă pui nginx în față, **păstrează totuși cron-ul lovind `127.0.0.1:3000`** — e mai rapid și evită bucle TLS.

---

## 7. Verificare că totul merge

```bash
# 1. Next.js răspunde
curl -I http://127.0.0.1:3000/api/dashboard/stats
# HTTP/1.1 200 OK

# 2. Cron de analiză manual
curl -X POST http://127.0.0.1:3000/api/cron/analysis | jq
# { "analyzed": 41, "opened": 0, "reason": "...", "distribution": {...} }

# 3. Cron de poziții manual
curl -X POST http://127.0.0.1:3000/api/cron/positions | jq
# { "checked": 0, "closed": 0 }

# 4. Timerele systemd
systemctl list-timers --all | grep nexus

# 5. Ultimele execuții cron (dacă folosești crontab)
tail -f /var/log/nexus-trade/cron-analysis.log
```

---

## 8. Log-uri și diagnostic

NEXUS TRADE scrie diagnosticul principal în **MongoDB → collection `ailogs`**. Există o intrare `CRON_END` după fiecare rulare, cu:

- `decision`: `OPENED` sau `NO_TRADE`
- `reasoning`: motivul explicit (ex: `"3 BUY signal(s) but none cleared minConfidence=75%. Best: SOLUSDC BUY 62%"`)
- `meta`: distribuția completă `{ STRONG_BUY, BUY, HOLD, SELL, STRONG_SELL }`

Vezi feed-ul live pe `/dashboard` → card **AI Decision Log** sau query direct în Mongo:

```bash
mongosh nexustrade --eval 'db.ailogs.find({action:"CRON_END"}).sort({timestamp:-1}).limit(5).pretty()'
```

---

## 9. Backup & maintenance

### Backup MongoDB zilnic

```cron
0 4 * * * mongodump --db nexustrade --out /var/backups/nexustrade/$(date +\%F) && find /var/backups/nexustrade/ -mtime +14 -type d -exec rm -rf {} +
```

### Log rotation

Creează `/etc/logrotate.d/nexus-trade`:

```
/var/log/nexus-trade/*.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
    copytruncate
}
```

### Update & redeploy

```bash
cd /opt/nexus-trade
sudo -u nexus git pull
sudo -u nexus npm install --legacy-peer-deps
sudo -u nexus npm run build
sudo systemctl restart nexus-trade
```

---

## 10. Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp        # SSH
sudo ufw allow 80/tcp        # HTTP (Let's Encrypt renew)
sudo ufw allow 443/tcp       # HTTPS
sudo ufw enable
```

**NU expune portul 3000 direct** — blochează-l cu UFW și lasă cron-ul să-l atingă prin `127.0.0.1`.

---

## 11. Checklist final

- [ ] Node.js 20 + Mongo instalate și pornite
- [ ] `npm run build` a trecut fără erori
- [ ] `/etc/systemd/system/nexus-trade.service` activ și cu `Restart=always`
- [ ] `.env.local` conține `MONGODB_URI`, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY` (32 char)
- [ ] Crontab sau systemd timers configurate pentru `/api/cron/analysis` și `/api/cron/positions`
- [ ] Autentificat în UI și configurate Binance (Testnet la început!) + cheile AI
- [ ] `Dry Run Mode` activat pentru primele 24h
- [ ] UFW pornit, port 3000 închis extern
- [ ] nginx + HTTPS dacă accesezi remote
- [ ] Backup `mongodump` cron adăugat

---

## Rezumat crontab minimal

Dacă vrei doar esențialul, astea două linii fac treaba:

```cron
*/15 * * * * curl -fsS -X POST http://127.0.0.1:3000/api/cron/analysis  >> /var/log/nexus-trade/cron.log 2>&1
*/5  * * * * curl -fsS -X POST http://127.0.0.1:3000/api/cron/positions >> /var/log/nexus-trade/cron.log 2>&1
```

Asta e tot. Aplicația face singură diagnosticarea și scrie în `ailogs` ce și de ce a făcut (sau n-a făcut) la fiecare rulare.
