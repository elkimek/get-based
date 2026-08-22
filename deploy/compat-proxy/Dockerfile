FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY scripts/vendor-packages ./scripts/vendor-packages
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force

COPY api ./api
COPY lib ./lib
COPY server/compat-proxy-server.js ./server/compat-proxy-server.js

USER node
EXPOSE 8787

CMD ["node", "server/compat-proxy-server.js"]
