FROM node:latest
WORKDIR /usr/src/app
COPY package*.json ./

#install PNPM globaly
RUN npm install -g pnpm

RUN pnpm install
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
