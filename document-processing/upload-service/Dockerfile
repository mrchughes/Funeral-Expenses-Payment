FROM node:18-alpine

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create temp upload directory
RUN mkdir -p /tmp/document-uploads

# Expose port
EXPOSE 3005

# Start the service
CMD ["node", "server.js"]
