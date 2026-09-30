FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/vendor-packages ./scripts/vendor-packages
RUN npm ci --ignore-scripts

COPY tsconfig.migration.json ./
COPY lib/profile-share-service.ts lib/profile-share-sqlite-store.ts lib/node-request-routing.ts ./lib/
COPY server/profile-share-server.ts ./server/
RUN ./node_modules/.bin/tsc -p tsconfig.migration.json

FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY --from=build /app/lib/profile-share-service.js ./lib/profile-share-service.js
COPY --from=build /app/lib/profile-share-sqlite-store.js ./lib/profile-share-sqlite-store.js
COPY --from=build /app/server/profile-share-server.js ./server/profile-share-server.js
COPY --from=build /app/lib/node-request-routing.js ./lib/node-request-routing.js

RUN mkdir -p /data \
  && chown node:node /data \
  && chmod 0700 /data

USER node
EXPOSE 8790

CMD ["node", "server/profile-share-server.js"]
