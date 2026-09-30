# Self-hosting alternative to Vercel. Build: docker build -t guesslock .
# Run: docker run -p 3000:3000 --env-file .env guesslock
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npx next build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Outage backup of API responses and the Omen seed (read by sync/generation)
COPY --from=build /app/data ./data
EXPOSE 3000
CMD ["node", "server.js"]
