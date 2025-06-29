# ใช้ Node.js official image
FROM node:latest

# กำหนด working directory
WORKDIR /usr/src/bot

# Copy package.json และ package-lock.json ก่อน
COPY package*.json /usr/src/bot

# ติดตั้ง dependencies
RUN npm install

# Copy source code ทั้งหมด
COPY . /usr/src/bot

# Build project
RUN npm run build

# รัน start command
CMD ["npm", "start"]
