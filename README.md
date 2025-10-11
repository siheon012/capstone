# Unmanned Store Action Timeline Extraction Agent

## Project Overview

This project is an anomaly detection agent for unmanned convenience stores that extracts action timelines from vision-based surveillance data. The system records all pre-anomalous behaviors of users in a database, allowing system administrators to query and retrieve timelines of incidents through natural language prompts. Administrators can easily discover what events occurred at specific times, providing comprehensive monitoring and security capabilities.

## Repository Status

🔒 **Private Repository**: This project is currently in development and not yet publicly available. If you need access, please contact the project maintainers.

## Architecture

- **Frontend**: Next.js with TypeScript
- **Backend**: Django REST Framework
- **Database**: PostgreSQL
- **AI Models**: Custom vision models running in separate Docker containers
- **Deployment**: Docker Compose with Nginx reverse proxy

## Deployment Options

### Production Deployment (Docker Compose) - Recommended

For production deployment with existing infrastructure:

```bash
# Clone the repository (requires access)
git clone [private-repo-url]
cd capstone

# Build and start all services
docker-compose up -d

# Check service status
docker-compose ps
```

**Service Ports:**

- Frontend (Next.js): `http://your-server:3000`
- Backend API (Django): `http://your-server:8001`
- Database (PostgreSQL): `localhost:5433`
- Nginx (Load Balancer): `http://your-server:80`

### Development Environment Setup

### Development Environment Setup

For local development and testing:

#### Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL 15+
- Docker (optional, for AI models)

#### Step 1: Clone Repository

```bash
# Clone the repository (requires access)
git clone [private-repo-url]
cd capstone
```

#### Step 2: Backend Setup

#### Step 2: Backend Setup

```bash
cd back
python3 -m venv env
source ./env/bin/activate

# Install dependencies
pip install -r requirements.txt

# Or for development
pip install -e .
```

#### Step 3: Frontend Setup

```bash
cd front
yarn install
```

#### Step 4: Environment Configuration

#### Step 4: Environment Configuration

Create environment configuration:

```bash
cd back
touch .env
```

**Development Configuration** (`.env`):

```env
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=127.0.0.1,localhost

# Database configuration
DB_ENGINE=django.db.backends.postgresql
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_HOST=localhost
DB_PORT=5432
```

**Production Configuration** (automatically handled by Docker):

```env
SECRET_KEY=auto-generated-secure-key
DEBUG=False
ALLOWED_HOSTS=your-domain.com,your-server-ip

# Database (Docker internal networking)
DB_HOST=db
DB_PORT=5432
```

Generate Django secret key:

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

#### Step 5: Database Setup

#### Step 5: Database Setup

```bash
cd back
source ./env/bin/activate

# Run migrations
python manage.py makemigrations
python manage.py migrate

# Create superuser (optional)
python manage.py createsuperuser
```

#### Step 6: Start Development Servers

```bash
# Terminal 1: Backend
cd back
source ./env/bin/activate
python manage.py runserver

# Terminal 2: Frontend
cd front
yarn dev
```

## Infrastructure & Dependencies

### Current Server Setup

This application runs alongside other services on the same server with the following port allocation:

**AI Model Containers:**

- **Port 7000**: Video Analysis Pipeline (YOLOv8x + MiVOLO + MeBOW + LLaVA)
- **Port 7500**: LangGraph API (Korean NLP + Text2SQL + Translation)
- **Port 8087**: Video Summary Service (LLaMA-based summarization)

**Application Services:**

- **Port 8000**: Django Backend (Development)
- **Port 3000**: Next.js Frontend (Development)

### AI Model Containers

The application integrates with three specialized Docker containers that provide AI-powered analysis capabilities:

#### 1. Video Analysis Pipeline Container (Port 7000)

📹 **Purpose**: Comprehensive video analysis for person detection, age/gender estimation, and behavior analysis.

**Key Features:**

- **Person & Face Detection**: YOLOv8x model for real-time object detection
- **Age & Gender Estimation**: MiVOLO (Multi-input Transformer) with 99.46% gender accuracy and 4.22 years age MAE
- **Behavior Analysis**: MeBOW (Motion-Enhanced Body Object Weight) for action pattern recognition
- **Visual Language Model**: LLaVA-FastViT-HD 0.5B for scene understanding

**Processing Pipeline:**

```bash
# FPS optimization for memory efficiency
convert_video_to_10fps() → MiVOLO analysis → Data processing → Database storage
```

**API Endpoint:**

```bash
POST /analyze
Content-Type: application/json
{
    "video_id": 123,
    "video_path": "/path/to/video.mp4"
}
```

#### 2. LangGraph API Container (Port 7500)

🤖 **Purpose**: Korean natural language processing and SQL query generation for timeline data retrieval.

**Key Features:**

- Korean text processing and question classification
- Korean-to-English translation using Helsinki-NLP/opus-mt-ko-en
- Text-to-SQL generation with finetuned T5-LM-Large model
- General question answering with Bllossom/llama-3.2-Korean-Bllossom-AICA-5B

**Processing Flow:**

```
Korean Query → Question Type Classification →
├── Timeline/SQL Question → Translation → SQL Generation
└── General Question → LLM Response
```

**API Endpoint:**

```bash
POST /api/process
Content-Type: application/json
{
    "prompt": "10시에서 13시 사이 사건 데이터를 알려줘"
}
```

#### 3. Video Summary Container (Port 8087)

📋 **Purpose**: AI-powered video content summarization using finetuned LLaMA models.

**Key Features:**

- Video content analysis and summarization
- User-triggered summary generation
- Optimized LLaMA-based model for video understanding
- RESTful API for external integration

**Usage:**

- Users upload videos through the frontend
- Summary generation triggered by user interaction
- AI provides comprehensive video content summary

**Container Management:**

```bash
# Check all AI containers status
docker ps | grep nvidia/cuda

# Monitor container logs
docker logs api      # Video Analysis
docker logs apps     # LangGraph API
docker logs vlm      # Video Summary
```

### Production Port Allocation

When deployed via Docker Compose:

- **Port 80/443**: Nginx Load Balancer
- **Port 8001**: Django Backend (Production)
- **Port 3000**: Next.js Frontend (Production)
- **Port 5433**: PostgreSQL Database (Production)

## Troubleshooting

### Port Conflicts

If you encounter port conflicts during deployment:

```bash
# Check current port usage
netstat -tlnp | grep LISTEN

# Modify docker-compose.yml port mappings if needed
# Example: Change 8001:8000 to 8002:8000
```

### Database Connection Issues

```bash
# Check PostgreSQL status
docker-compose logs db

# Reset database (caution: data loss)
docker-compose down -v
docker-compose up -d
```

### AI Container Management

```bash
# Verify all AI containers are running
docker ps | grep cuda

# Check individual container status and logs
docker logs api      # Video Analysis Pipeline
docker logs apps     # LangGraph API Service
docker logs vlm      # Video Summary Service

# Monitor container resource usage
docker stats api apps vlm

# Restart specific container if needed
docker restart api   # or apps, vlm
```

## Contributing

This is a private repository. For contribution guidelines and access requests, please contact the project maintainers.

## License

Private - All rights reserved.
