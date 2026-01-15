#!/bin/bash
# EC2 run script: pull image (if using registry) or build locally, then start docker-compose
set -e
cd $(dirname "$0")

# ensure env file exists
if [ ! -f .env ]; then
  echo ".env not found in $(pwd). Copy .env.dev or create one first." >&2
  exit 1
fi

# build images and start services
docker compose -f docker-compose.yml up --build -d

echo "Services started. Use 'docker compose ps' to check." 
