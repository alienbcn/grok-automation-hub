# Oracle Cloud Always Free — worker OpenClaw

El Hub (Etsy MCP) se queda en Vercel. Oracle es solo para un worker 24/7
(OpenClaw + Playwright persistente) en Always Free ARM.

## Por qué los agentes se atascan

La consola OCI (https://cloud.oracle.com/) pide Cloud Account Name.
Signup exige identidad humana (captcha, tarjeta con hold, a veces 2FA).
No hay tenancy verificable en el correo del proyecto.

## Spec de la instancia

- Name: `openclaw`
- Image: Ubuntu 24.04 aarch64
- Shape: `VM.Standard.A1.Flex`
- OCPUs: 2 (máx 4)
- RAM: 12 GB (máx 24 GB)
- Boot: 50 GB
- Region preferida: eu-frankfurt-1; fallback eu-amsterdam-1
- SSH: clave ed25519 del operador, no del repo

Si Create falla con Out of capacity: cambia Availability Domain y reintenta.

## Post-create (en la VM)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential curl git jq
sudo hostnamectl set-hostname openclaw
sudo loginctl enable-linger ubuntu
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh --hostname=openclaw
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

## Cierre de red (obligatorio)

Networking → VCN → Security Lists → Default:
quitar todo ingress excepto `0.0.0.0/0 UDP 41641` (Tailscale).
Egress default se deja.

No publicar 22/80/443. El gateway queda en loopback + Tailscale Serve.

## Relación con el Hub

- Etsy Open API: solo `https://grok-automation-hub.vercel.app`
- `ETSY_PUBLISH_OK` sigue en false
- Esta VM no sustituye Supabase ni el MCP HTTP de Vercel
