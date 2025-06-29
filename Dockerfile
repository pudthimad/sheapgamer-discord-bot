# ใช้ Node.js official image
FROM node:18-alpine

# กำหนด working directory
WORKDIR /app

# Copy package.json และ package-lock.json ก่อน
COPY package*.json ./

# ติดตั้ง dependencies
RUN npm install

# Copy source code ทั้งหมด
COPY . .

# Build project
RUN npm run build

# รัน start command
CMD ["npm", "start"]
