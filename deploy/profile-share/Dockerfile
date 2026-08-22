FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY lib/profile-share-service.js ./lib/profile-share-service.js
COPY lib/profile-share-sqlite-store.js ./lib/profile-share-sqlite-store.js
COPY server/profile-share-server.js ./server/profile-share-server.js

RUN mkdir -p /data \
  && chown node:node /data \
  && chmod 0700 /data

USER node
EXPOSE 8790

CMD ["node", "server/profile-share-server.js"]
