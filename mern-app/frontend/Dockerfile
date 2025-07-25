# ---- Build Stage ----
FROM node:18-alpine as build

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install


# Copy .env first so React build picks up environment variables
COPY .env .env
COPY . .

# Build your production-ready frontend
RUN npm run build

# ---- Production Stage ----
FROM nginx:alpine


# Copy build output to nginx's html directory
COPY --from=build /app/build /usr/share/nginx/html

# Remove default nginx config and copy custom config
RUN rm -f /etc/nginx/conf.d/default.conf
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
