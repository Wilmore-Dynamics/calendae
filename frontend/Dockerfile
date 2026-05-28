FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Expose port
EXPOSE 3000

# Start application
CMD ["npm", "start"]
