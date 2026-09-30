FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/vendor-packages ./scripts/vendor-packages
RUN npm ci --ignore-scripts

COPY tsconfig.migration.json ./
COPY api ./api
COPY lib ./lib
COPY shared ./shared
COPY server/compat-proxy-server.ts ./server/
RUN ./node_modules/.bin/tsc -p tsconfig.migration.json

FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY scripts/vendor-packages ./scripts/vendor-packages
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force

COPY --from=build /app/api ./api
COPY --from=build /app/lib ./lib
COPY --from=build /app/shared ./shared
COPY --from=build /app/server/compat-proxy-server.js ./server/compat-proxy-server.js

USER node
EXPOSE 8787

CMD ["node", "server/compat-proxy-server.js"]
