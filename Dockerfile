# Use Node.js 20 as the base image
FROM node:20

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or pnpm-lock.yaml) files
COPY package*.json pnpm-lock.yaml ./

# Install PNPM globally
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install

# Copy the rest of the application code
COPY . .

# Set environment variables
ENV PORT 8080
ENV HOST 0.0.0.0

# Expose port 8080
EXPOSE 8080

# Start the server
CMD ["node", "src/server.js"]
