# Single service: Node backend serving the API and the built web app.
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ai-tutor/web build && pnpm --filter @ai-tutor/server build
# Server with production dependencies only
RUN pnpm --filter @ai-tutor/server deploy --prod --legacy /out

FROM node:22-slim
WORKDIR /app
COPY --from=build /out ./server
COPY --from=build /app/apps/web/dist ./web/dist
ENV NODE_ENV=production STATIC_DIR=/app/web/dist PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server/dist/index.js"]
