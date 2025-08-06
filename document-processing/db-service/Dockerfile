FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy shared directory first
COPY ./shared /app/shared/

# Copy package.json and package-lock.json
COPY ./db-service/package*.json ./

# Install dependencies
RUN npm install

# Copy app source
COPY ./db-service .

# Expose port
EXPOSE 4008

# Start command
CMD ["npm", "start"]
