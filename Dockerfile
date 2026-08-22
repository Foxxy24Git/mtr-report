# Debian (bukan Alpine): libreoffice-calc crash di Alpine/musl (UNO
# RuntimeException, exit 134) saat convert-to pdf - lihat lib/xlsxToPdf.ts.
# Semua stage ikut pindah, bukan cuma runner, supaya binary native yang
# ter-compile saat `npm ci` (mis. sharp) cocok dengan libc runner (glibc).
FROM node:20-bookworm-slim AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# libreoffice-calc: dipakai lib/xlsxToPdf.ts (soffice --headless) untuk
# konversi Download Harian .xlsx -> .pdf identik layout (bukan render ulang).
# util-linux: sediakan `setpriv`, pengganti su-exec (Alpine) untuk turun hak
# ke user non-root di docker-entrypoint.sh.
RUN apt-get update && apt-get install -y --no-install-recommends \
  libreoffice-calc util-linux \
  && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Skema + migrasi Prisma disertakan untuk referensi. Migrasi & seed dijalankan
# sekali via perintah terpisah saat deploy (lihat README — "Deploy Proxmox").
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Tetap root di sini: entrypoint butuh root untuk chown folder public/uploads
# (bind mount dari host) sebelum turun hak ke user "nextjs". Lihat komentar
# di docker-entrypoint.sh.
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
