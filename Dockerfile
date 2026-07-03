FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node src ./src
COPY --chown=node:node tsconfig.json ./
RUN chown -R node:node /app

USER node

EXPOSE 65535

CMD ["node", "--import", "tsx", "src/server.ts"]
