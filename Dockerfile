FROM node:22-alpine

WORKDIR /app

ENV PORT=65535

COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node src ./src
RUN chown -R node:node /app

USER node

EXPOSE 65535

CMD ["node", "src/server.js"]
