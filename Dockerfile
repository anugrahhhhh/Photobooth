# Tahap build: alat kompilasi untuk modul native (better-sqlite3, bcrypt) bila prebuilt tidak tersedia.
FROM node:24-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Tahap jalan: hanya runtime Node, dependensi, dan kode aplikasi.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
