# Simple multi-stage build for React app
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build arguments for AWS configuration
ARG REACT_APP_BROWSE_API_URL
ARG REACT_APP_INVENTORY_API_URL
ARG REACT_APP_S3_BUCKET_URL
ARG REACT_APP_COGNITO_USER_POOL_ID
ARG REACT_APP_COGNITO_CLIENT_ID
ARG REACT_APP_COGNITO_REGION

# Set environment variables for build
ENV REACT_APP_BROWSE_API_URL=$REACT_APP_BROWSE_API_URL
ENV REACT_APP_INVENTORY_API_URL=$REACT_APP_INVENTORY_API_URL
ENV REACT_APP_S3_BUCKET_URL=$REACT_APP_S3_BUCKET_URL
ENV REACT_APP_COGNITO_USER_POOL_ID=$REACT_APP_COGNITO_USER_POOL_ID
ENV REACT_APP_COGNITO_CLIENT_ID=$REACT_APP_COGNITO_CLIENT_ID
ENV REACT_APP_COGNITO_REGION=$REACT_APP_COGNITO_REGION
ENV NODE_ENV=production

# Build the app
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy built app to nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Create log symlinks for CloudWatch
RUN ln -sf /dev/stdout /var/log/nginx/access.log \
    && ln -sf /dev/stderr /var/log/nginx/error.log

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]