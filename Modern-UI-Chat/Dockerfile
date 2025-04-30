FROM node:20-slim AS builder

# Install Python, pip, and OCR dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    tesseract-ocr \
    poppler-utils \
    libtesseract-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create and activate virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY requirements.txt ./

# Install Node.js dependencies
RUN npm install --legacy-peer-deps

# Install Python dependencies
RUN pip3 install --upgrade pip && \
    pip3 install --no-cache-dir -r requirements.txt

# Copy all source code
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NEXT_PUBLIC_TGI_SERVER_URL=http://172.16.34.235:8080/v1/chat/completions

# Build the Next.js application
RUN npm run build

# Expose ports
EXPOSE 3000 8444

# Set environment variables for runtime
ENV HOST=0.0.0.0
ENV PORT=3000
ENV PYTHON_SERVER_PORT=8444
ENV PYTHONUNBUFFERED=1

# Start both servers
COPY start.sh /start.sh
RUN chmod +x /start.sh
CMD ["/start.sh"]