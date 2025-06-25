# Use Node.js 20 as the base image
FROM node:20-slim

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and pnpm lock file
COPY package.json pnpm-lock.yaml ./

# Install PNPM globally
RUN npm install -g pnpm

# Install dependencies without devDependencies (for production)
RUN pnpm install --frozen-lockfile --prod

# Copy only the necessary app files
COPY . .

# Set environment variables
ENV PORT=8080
ENV HOST=0.0.0.0

# Expose port
EXPOSE 8080

# Use a non-root user if applicable (optional security best practice)
# USER node

# Start the server
CMD ["node", "src/server.js"]
