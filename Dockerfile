FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV PLAYWRIGHT_HEADLESS=true

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
