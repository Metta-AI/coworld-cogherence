# Deploying cogherence

cogherence runs in production at **https://cogherence.dbloom.in**, served by a
single EC2 origin behind a Cloudflare Tunnel. The box is **shared** with
`polis.dbloom.in`, `agricogla.dbloom.in`, and `cognames.dbloom.in`: each app is
an isolated systemd service on its own localhost port plus a dedicated
`cloudflared` tunnel. This doc is the runbook — the fast path first, the
one-time provisioning and the topology after. (Ported from the agricogla / polis
deploy pattern.)

## Fast deploy

```bash
npm run deploy:prod                 # build main -> S3 -> SSM swap -> restart -> verify
npm run deploy:prod -- --ref HEAD   # deploy a specific git ref (branch/tag/sha)
```

That's it. [`scripts/deploy-prod.sh`](../scripts/deploy-prod.sh):

1. builds the ref in a **throwaway git worktree** (`npm ci && npm run build` →
   the client `dist/` + the esbuild server bundle `dist-server/cli-serve.js`);
2. tars `dist/ dist-server/ package*.json .deploy-version.json` and uploads it to
   S3, then mints a presigned GET URL;
3. sends an **SSM** command to the box that downloads the artifact (presigned
   GET), `npm ci --omit=dev`, atomically swaps `/opt/cogherence/app`, and
   restarts `cogherence.service` (**rolling back** to the previous release on
   failure);
4. verifies `/health` (`ok`) and `/version` (the per-deploy `deployId`) **locally
   on the box and publicly through the tunnel**. `/version` echoing the deployId
   is the end-to-end proof the new code is actually live.

Notes:

- The script builds from **committed git state** and ignores a dirty working
  tree — commit first, then deploy (use `--ref HEAD` to ship your branch).
- Deploys are **SSM-only — there is no SSH key on the box** and the security
  group has no inbound rules.
- Useful env overrides: `COGENT_ORG_PROFILE` (AWS profile, default `cogora`),
  `COGHERENCE_DEPLOY_REF`, `COGHERENCE_EC2_INSTANCE_ID`, `COGHERENCE_PUBLIC_URL`,
  `COGHERENCE_PORT`, `COGHERENCE_SKIP_PUBLIC_VERIFY=1`.

## Topology

| | value |
|---|---|
| Box | EC2 `i-0b9ff9416716820ac` (Amazon Linux 2023, t3.small, us-east-1), tagged `Name=polis`. AWS account `815935788409`, local profile `cogora`. |
| Service | `cogherence.service` runs `node /opt/cogherence/app/dist-server/cli-serve.js --port 8791` as the `cogherence` user, with `NODE_ENV=production` (which makes the server serve the built `dist/` statically and default the bare routes to the live view). App at `/opt/cogherence/app`, prior releases under `/opt/cogherence/releases`. |
| Port | app `127.0.0.1:8791`; tunnel metrics `127.0.0.1:2004`. (polis uses 8788/2001, agricogla 8789/2002, cognames 8790/2003.) |
| Tunnel | Cloudflare Tunnel `cogherence` (`afbddf19-14ad-4a13-8667-de3a725e1fbb`, `config_src=local`) as `cloudflared-cogherence.service`. Config `/etc/cloudflared/cogherence.yml`, token `/etc/cloudflared/cogherence.env`. |
| DNS | proxied CNAME `cogherence.dbloom.in → afbddf19-14ad-4a13-8667-de3a725e1fbb.cfargotunnel.com` in the `dbloom.in` zone. |
| Artifacts | S3 `s3://polis-cogame-deploy-815935788409-us-east-1/cogherence/releases/` (shared bucket; the box never needs S3 IAM — it fetches via presigned GET). |

### Drive the box without SSH

```bash
aws --profile cogora --region us-east-1 ssm send-command \
  --instance-ids i-0b9ff9416716820ac --document-name AWS-RunShellScript \
  --parameters 'commands=["systemctl status cogherence.service cloudflared-cogherence.service --no-pager"]'
# read output: aws ... ssm get-command-invocation --command-id <id> --instance-id i-0b9ff9416716820ac
```

Or an interactive shell: `aws --profile cogora --region us-east-1 ssm start-session --target i-0b9ff9416716820ac`.

## One-time provisioning (already done)

Re-run only when rebuilding the box from scratch. Cloudflare creds live in SSM
Parameter Store (us-east-1, acct `815935788409`): `/aegis/cloudflare-email` +
`/aegis/cloudflare-api-key` (Global API Key → `X-Auth-Email`/`X-Auth-Key`
headers). Account `0abc983728c4e6eab6f27f9d0c9fe23a`, `dbloom.in` zone
`0e50cbe3df79d46911f15c1c2c151780`.

1. **Cloudflare tunnel** — `POST /accounts/{acct}/cfd_tunnel` with
   `{"name":"cogherence","config_src":"local","tunnel_secret":"<base64 32 bytes>"}`;
   fetch the run token from `/accounts/{acct}/cfd_tunnel/{id}/token`.
2. **DNS** — proxied CNAME `cogherence → {id}.cfargotunnel.com` in the zone.
3. **On the box** (via SSM, as root):
   - `useradd --system --home-dir /var/lib/cogherence --shell /sbin/nologin cogherence`
   - `/etc/cloudflared/cogherence.yml`:
     ```yaml
     ingress:
       - hostname: cogherence.dbloom.in
         service: http://127.0.0.1:8791
       - service: http_status:404
     ```
   - `/etc/cloudflared/cogherence.env`: `TUNNEL_TOKEN=<token>` (chmod 600)
   - `/etc/systemd/system/cogherence.service` — `User=cogherence`,
     `WorkingDirectory=/opt/cogherence/app`, `Environment=NODE_ENV=production`
     `AWS_REGION=us-east-1`,
     `ExecStart=/usr/local/bin/node /opt/cogherence/app/dist-server/cli-serve.js --port 8791`,
     `Restart=always`.
   - `/etc/systemd/system/cloudflared-cogherence.service` — `EnvironmentFile=/etc/cloudflared/cogherence.env`,
     `ExecStart=/usr/local/bin/cloudflared --no-autoupdate tunnel --config /etc/cloudflared/cogherence.yml --metrics 127.0.0.1:2004 --loglevel info run afbddf19-14ad-4a13-8667-de3a725e1fbb`,
     `Restart=always`.
   - `systemctl daemon-reload && systemctl enable --now cogherence.service cloudflared-cogherence.service`
4. Then `npm run deploy:prod` ships the app code.

## The game loop (empty lobby)

In production the server boots into an **empty lobby** (`NODE_ENV=production` →
`cli-serve` defaults to `--lobby`: 0 cogs, not started). Visitors join by name or
add bots, then hit **Start game**; once started, late arrivals observe. A game
runs to its turn limit (**20** in prod) and then offers **Start new game**, which
returns to an empty lobby. Controls map to endpoints (reachable on
`127.0.0.1:8791` from the box over SSM, or driven by the UI): `POST /start`,
`POST /cogs/add` (bot), `POST /cogs/claim` (join by name), `POST /reset` (→ empty
lobby), `POST /extend` (+10 turns), `POST /pause` · `/resume`.

Pacing is **wait-ready** in prod (default on): a turn's Commit has no deadline —
it advances only once every cog is ready (bots ready themselves; humans hit
Ready), so the shared game is player-paced. Caveat: an idle human stalls the
turn; the operator can `POST /resume` after toggling, or kick the seat.

Relevant `cli-serve` flags: `--lobby` (boot into the lobby; the prod default),
`--start` (begin immediately), `--cogs N` / `--agents …` (pre-seat), `--limit N`
(game length), `--no-wait-ready` (timed pacing instead). Running LLM seats would
need `bedrock:InvokeModel` on the instance role; seats are also switchable to
autopilot live per-panel in the UI.
