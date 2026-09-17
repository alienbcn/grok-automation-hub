# OpenClaw en Hetzner (caja general)

Oracle Always Free queda aparcado (captcha / tenancy).
Host elegido: Hetzner Cloud CX32 Ubuntu 24.04, Falkenstein o Helsinki.
Paquete: `openclaw@latest` (hoy 2026.9.4; no hay semver “v2”).

SSH key (la misma que se generó para OCI):

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIA+sSsU/odhGrrDiae1npw29u8IohxhziKgSiwmG26fi alberto-oracle-openclaw
```

Alta: https://console.hetzner.cloud/ → Add Server → Ubuntu 24.04 → CX32 8 GB → pegar key → IPv4.

```bash
ssh -i ~/.ssh/id_ed25519_oracle root@IP
apt update && apt upgrade -y
curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard
openclaw onboard --install-daemon
```

No exponer el puerto del gateway. Tailscale o túnel SSH.
Etsy MCP público sigue en Vercel.
