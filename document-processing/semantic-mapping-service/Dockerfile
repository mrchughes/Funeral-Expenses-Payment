FROM node:18-alpine

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create .env file for configuration
RUN touch .env

# Expose port
EXPOSE 3004

# Start the service
CMD ["node", "server.js"]
