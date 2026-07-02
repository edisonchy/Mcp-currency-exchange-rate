FROM node:22-alpine

WORKDIR /app

ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node src ./src
RUN chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
