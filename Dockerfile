FROM node:20-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 \
    libasound2 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libpango-1.0-0 libcairo2 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npx playwright install --with-deps chromium
COPY scripts ./scripts
COPY src ./src
ENV HOST=0.0.0.0 PORT=8931 BROWSER=chromium HEADLESS=true \
    USER_DATA_DIR=/data/profile SHARED_BROWSER_CONTEXT=true ALLOWED_HOSTS=*
VOLUME ["/data/profile"]
EXPOSE 8931
CMD ["node", "scripts/start.mjs"]
