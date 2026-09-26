FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps --omit=dev

COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV SESSION_DIR=/app/session

RUN mkdir -p /app/session /app/data /app/tmp

EXPOSE 3000

CMD ["node", "index.js"]
