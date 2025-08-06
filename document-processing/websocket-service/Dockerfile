FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy shared directory first
COPY ./shared /app/shared/

# Copy package.json and package-lock.json
COPY ./websocket-service/package*.json ./

# Install dependencies
RUN npm install

# Copy app source
COPY ./websocket-service .

# Expose port
EXPOSE 4007

# Start command
CMD ["npm", "start"]
