# Oracle Cloud — caja general (alienbcn-core)

Always Free ARM para **todo** el ecosistema: OpenClaw, Playwright,
Novomart, Gumroad, Hotmart, KDP, crons y backups.
Etsy API pública se queda en Vercel.

## Por qué los agentes se atascan

https://cloud.oracle.com/ pide Cloud Account Name.
Signup = captcha + tarjeta (hold) + a veces 2FA.
En el Gmail del proyecto no hay tenancy OCI todavía.

## Spec (una sola VM, cupo ARM completo)

- Name: `alienbcn-core`
- Image: Ubuntu 24.04 aarch64
- Shape: `VM.Standard.A1.Flex`
- OCPUs: 4
- RAM: 24 GB
- Boot: 100 GB (Always Free hasta 200 GB total)
- Region: `eu-frankfurt-1` (fallback `eu-amsterdam-1`)
- SSH: clave del operador, no del repo

Out of capacity → cambia Availability Domain. No crear micros AMD.

## Qué corre en la caja

`/opt/novomart-core`

- `bin/` scripts
- `logs/`
- `artifacts/` salidas de agentes
- `products/{etsy,gumroad,hotmart,kdp,novomart}` staging de packs
- `backups/`

Servicios:

1. OpenClaw gateway (loopback + token + Tailscale Serve)
2. Playwright / browser jobs para paneles sin API decente
3. systemd timers (sync, backup diario de `~/.openclaw` + `/opt/novomart-core`)
4. Docker para jobs aislados cuando haga falta

## Post-create

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential curl git unzip jq ca-certificates python3 python3-venv docker.io
sudo hostnamectl set-hostname alienbcn-core
sudo usermod -aG docker ubuntu
sudo loginctl enable-linger ubuntu
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh --hostname=alienbcn-core
curl -fsSL https://openclaw.ai/install.sh | bash
source ~/.bashrc
openclaw config set gateway.bind loopback
openclaw config set gateway.auth.mode token
openclaw doctor --generate-gateway-token
openclaw config set gateway.tailscale.mode serve
openclaw config set gateway.trustedProxies '["127.0.0.1"]'
openclaw gateway install
systemctl --user restart openclaw-gateway.service
```

## Red

VCN → Security Lists → Default:
ingress solo `0.0.0.0/0 UDP 41641`. Egress default.
Después de confirmar Tailscale SSH se puede apagar `sshd`.

## No hacer en esta VM

- No poner el callback OAuth de Etsy aquí (la IP pública se cierra).
- No guardar `ETSY_SHARED_SECRET` / service role en disco sin cifrar.
- No publicar listings ni subir producto final sin aviso.
