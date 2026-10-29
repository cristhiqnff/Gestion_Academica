# Imagen oficial de Node 26 (tag verificado en Docker Hub).
# Debian slim incluye node:sqlite sin dependencias nativas adicionales.
FROM node:26-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/datos/academico.db

WORKDIR /app

# Dependencias de producción usando el lockfile.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Código de la aplicación y directorio escribible para SQLite.
COPY --chown=node:node src ./src
RUN mkdir -p /app/datos && chown node:node /app/datos

# El proceso no corre como root.
USER node

EXPOSE 3000

# Render usa healthCheckPath; este HEALTHCHECK sirve para docker run local.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "src/server.js"]
