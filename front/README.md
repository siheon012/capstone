# Frontend - Next.js Application

Next.js-based frontend application for unmanned store CCTV video analysis service.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [API Integration](#api-integration)
- [UX/UI Enhancements](#uxui-enhancements)
- [Environment Setup](#environment-setup)
- [Development Guide](#development-guide)
- [Deployment](#deployment)

---

## Overview

Next.js 15-based frontend application providing real-time CCTV video upload, analysis monitoring, and AI-powered query interface for unmanned store management.

### Key Highlights

- ✅ **No Authentication Required** - Admin-only single store monitoring system
- ✅ **Real-time Progress Tracking** - S3 upload & analysis progress via HTTP polling
- ✅ **Custom Video Player** - Purpose-built player with event timeline integration
- ✅ **Responsive Design** - Mobile-first approach with Tailwind breakpoints
- ✅ **Modular Architecture** - Clean separation: actions/ (API) + hooks/ (logic) + components/ (UI)
- ✅ **Enhanced UX/UI** - Toast notifications, animations, loading states, error handling

### Tech Stack

- **Framework**: Next.js 15.2.4 (App Router)
- **Language**: TypeScript 5
- **UI Library**: React 19
- **Component System**: Radix UI + shadcn/ui
- **Styling**: Tailwind CSS 3.4.1
- **Icons**: Lucide React
- **Deployment**: Docker + AWS ECS Fargate

---

## Architecture

### 1. Three-Layer Separation Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                     Components Layer                        │
│  (UI Presentation - Video Player, Chat, Upload, Timeline)   │
└─────────────────────────────────────────────────────────────┘
                           ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│                       Hooks Layer                           │
│   (Business Logic - File Upload, Progress Polling, Chat)    │
└─────────────────────────────────────────────────────────────┘
                           ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│                      Actions Layer                          │
│        (API Communication - Server Actions via Fetch)        │
└─────────────────────────────────────────────────────────────┘
                           ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│                     Backend REST API                        │
│           (Django + PostgreSQL + AWS Services)              │
└─────────────────────────────────────────────────────────────┘
```

### 2. Data Flow

**Video Upload Flow:**

```
User File Selection
  → useFileUpload Hook (metadata extraction)
    → s3-upload-service.ts (presigned URL request)
      → XMLHttpRequest PUT to S3 (progress tracking)
        → s3-upload-service.ts (confirm upload)
          → Backend SQS → Lambda → Batch GPU Analysis
```

**Analysis Progress Flow:**

```
Video Upload Complete
  → useAnalysisProgress Hook (HTTP polling every 2s)
    → ai-service.ts (GET /api/videos/{id}/analysis/progress/)
      → Update UI progress bar (0-100%)
        → Analysis Complete → Load Events & Summary
```

**Chat Query Flow:**

```
User Query Input
  → useChatMessage Hook (message management)
    → vector-search-service.ts (POST /api/search/events/query/)
      → Backend RAG (Vector Search + Rerank + Claude)
        → Streaming Response → Chat UI Update
```

---

## Project Structure

### `/app` Directory (App Router)

```
app/
├── actions/                    # Server Actions (API Layer)
│   ├── ai-service.ts          # RAG, VLM, Summary generation
│   ├── s3-upload-service.ts   # S3 presigned URL, upload flow
│   ├── video-service.ts       # Video CRUD operations
│   ├── event-service.ts       # Event retrieval & filtering
│   ├── history-service.ts     # Session history management
│   ├── session-service.ts     # Session creation & updates
│   └── vector-search-service.ts # Semantic search queries
├── page.tsx                   # Main page (1181 lines)
├── layout.tsx                 # Root layout
├── uploaded_video/            # Video list page
└── video_detail/[id]/         # Dynamic video detail page
```

### `/hooks` Directory (Business Logic Layer)

```
hooks/
├── useFileUpload.ts           # S3 upload workflow (490 lines)
│   ├── getVideoDurationFromFile() - HTML5 Video API metadata extraction
│   ├── 14-step progress tracking (0% → 100%)
│   └── Error handling & retry logic
├── useAnalysisProgress.ts     # Analysis polling (264 lines)
│   ├── HTTP polling every 2s
│   ├── Progress state management
│   └── Auto-stop on completion/failure
├── useVideoControls.ts        # Video playback control
│   ├── Play/pause, skip ±10s
│   ├── Timeline sync
│   └── Mobile event handling
├── useSummary.ts              # Summary generation & loading
├── useChatMessage.ts          # Chat state management
├── useToast.ts                # Toast notification system
├── use-mobile.tsx             # Mobile device detection
└── use-viewport-height.ts     # Responsive viewport handling
```

### `/components` Directory (UI Layer)

```
components/
├── video/
│   ├── VideoPlayer.tsx        # Custom video player (434 lines)
│   │   ├── Upload progress overlay (circular animation)
│   │   ├── Analysis progress overlay
│   │   ├── Play/pause, skip controls
│   │   └── Responsive design (md: breakpoints)
│   └── EventTimeline.tsx      # Event markers & navigation
├── chat/
│   ├── ChatInterface.tsx      # RAG query input & response
│   ├── ChatInput.tsx          # Text input with suggestions
│   └── ChatMessage.tsx        # Message bubble rendering
├── upload/
│   ├── UploadSection.tsx      # Drag & drop upload zone
│   └── VideoThumbnail.tsx     # Thumbnail preview
├── history/
│   ├── HistorySidebar.tsx     # Session history sidebar
│   └── HistoryList.tsx        # Session list rendering
├── feedback/
│   ├── ToastNotification.tsx  # Toast system (315 lines)
│   │   ├── Success, Error, Warning, Info types
│   │   ├── Auto-dismiss with timer
│   │   └── Slide-in animation
│   └── ErrorBoundary.tsx      # Global error handling
├── layout/
│   ├── SmartHeader.tsx        # Responsive header (374 lines)
│   │   ├── Mobile menu toggle
│   │   ├── Scroll-based visibility
│   │   └── Navigation links
│   └── MobileNav.tsx          # Mobile navigation drawer
└── ui/                        # shadcn/ui components
    ├── button.tsx
    ├── card.tsx
    ├── dialog.tsx
    ├── input.tsx
    ├── progress.tsx
    └── ... (30+ components)
```

---

## Key Features

### 1. Real-time Video Upload with Progress Tracking

**Implementation:** [useFileUpload.ts](hooks/useFileUpload.ts)

```typescript
// 14-step progress tracking
const uploadSteps = [
  { progress: 5, stage: 'Preparing upload...' },
  { progress: 15, stage: 'Requesting S3 URL...' },
  { progress: 25, stage: 'Extracting metadata...' },
  { progress: 40, stage: 'Uploading to S3...' },
  // ... up to 100%
];

// XMLHttpRequest for native progress events
xhr.upload.addEventListener('progress', (event) => {
  if (event.lengthComputable) {
    const progress = (event.loaded / event.total) * 100;
    onProgress(progress);
  }
});
```

**Features:**

- ✅ **Presigned URL Upload** - Secure direct S3 upload without backend proxy
- ✅ **Native Progress** - XMLHttpRequest progress events (not fetch API)
- ✅ **Metadata Extraction** - HTML5 Video API for duration, resolution
- ✅ **Upload Validation** - JWT token-based request validation

### 2. Analysis Progress Monitoring

**Implementation:** [useAnalysisProgress.ts](hooks/useAnalysisProgress.ts)

```typescript
// HTTP polling (no WebSocket)
const progressPolling = setInterval(async () => {
  const data = await getAnalysisProgress(videoId);
  setAnalysisProgress(data.progress); // 0-100

  if (data.is_completed) {
    clearInterval(progressPolling);
    loadEventsAndSummary();
  }
}, 2000); // Every 2 seconds
```

**Features:**

- ✅ **2-Second Polling** - Real-time progress updates via HTTP (not WebSocket)
- ✅ **Auto-completion Detection** - Stops polling on success/failure
- ✅ **Retry Logic** - Handles network errors with exponential backoff
- ✅ **Status Tracking** - `pending`, `processing`, `completed`, `failed`

### 3. Custom Video Player

**Implementation:** [VideoPlayer.tsx](components/video/VideoPlayer.tsx)

```tsx
<video
  ref={videoRef}
  src={videoUrl}
  onTimeUpdate={handleTimeUpdate}
  onLoadedMetadata={handleMetadataLoad}
/>

// Custom controls
<Button onClick={handlePlayPause}>
  {isPlaying ? <Pause /> : <Play />}
</Button>
<Button onClick={() => handleSkip(-10)}>
  <SkipBack /> -10s
</Button>
```

**Features:**

- ✅ **Custom UI** - No native controls, fully styled player
- ✅ **Event Timeline Integration** - Click event → jump to timestamp
- ✅ **Mobile-optimized** - Touch controls, responsive sizing (md: breakpoints)
- ✅ **Progress Overlays** - Upload & analysis progress with animations

### 4. RAG-based Natural Language Search

**Implementation:** [vector-search-service.ts](app/actions/vector-search-service.ts)

```typescript
export async function searchEvents(query: string, videoId: string) {
  const response = await fetch(`${API_BASE}/api/search/events/query/`, {
    method: 'POST',
    body: JSON.stringify({
      query,
      video_id: videoId,
      use_rerank: true, // Bedrock Cohere Rerank
      use_windowing: true, // Time-window context expansion
    }),
  });
  return response.json();
}
```

**Backend Integration:**

1. **Titan Embeddings V2** - Query vectorization
2. **pgvector** - PostgreSQL semantic search
3. **Cohere Rerank** - Result relevance scoring
4. **Claude 3.5 Sonnet V2** - Natural language response generation

### 5. VLM Chat Interface

**Implementation:** [ChatInterface.tsx](components/chat/ChatInterface.tsx)

```typescript
const sendMessage = async (query: string) => {
  const response = await generateVLMResponse(
    videoId,
    query,
    selectedFrame // Specific timestamp frame analysis
  );

  setMessages((prev) => [
    ...prev,
    {
      role: 'assistant',
      content: response.answer,
    },
  ]);
};
```

**Features:**

- ✅ **Frame Analysis** - Claude VLM analyzes specific video frames
- ✅ **Behavior Statistics** - Left/center/right region behavior patterns
- ✅ **Timeline Extraction** - Event chronology generation

---

## Tech Stack

### Core Framework

| Technology | Version | Purpose                         |
| ---------- | ------- | ------------------------------- |
| Next.js    | 15.2.4  | React framework with App Router |
| React      | 19.0.0  | UI library                      |
| TypeScript | 5.0     | Type safety                     |

### UI Components & Styling

| Technology   | Version | Purpose                        |
| ------------ | ------- | ------------------------------ |
| Tailwind CSS | 3.4.1   | Utility-first CSS framework    |
| Radix UI     | Latest  | Accessible headless components |
| shadcn/ui    | Latest  | Pre-built component library    |
| Lucide React | Latest  | Icon library (500+ icons)      |

**Radix UI Components Used:**

- `@radix-ui/react-dialog` - Modal dialogs
- `@radix-ui/react-dropdown-menu` - Dropdown menus
- `@radix-ui/react-slider` - Volume/progress sliders
- `@radix-ui/react-toast` - Toast notifications
- `@radix-ui/react-tabs` - Tab navigation
- ... (15+ components)

### State Management

- **React Hooks** - Local state management
- **Custom Hooks** - Business logic encapsulation
- **No Redux/Zustand** - Hooks-only architecture

### HTTP Client

- **Fetch API** - Server Actions HTTP requests
- **XMLHttpRequest** - S3 upload progress tracking

### Development Tools

| Tool                | Purpose        |
| ------------------- | -------------- |
| ESLint              | Code linting   |
| PostCSS             | CSS processing |
| TypeScript Compiler | Type checking  |

---

## API Integration

### Server Actions Pattern

All API calls use Next.js Server Actions with `'use server'` directive:

```typescript
// app/actions/video-service.ts
'use server';

export async function getUploadedVideos() {
  const response = await fetch(`${API_BASE}/api/videos/`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });
  return response.json();
}
```

### API Endpoints Map

| Service           | Endpoint                                  | Action File                |
| ----------------- | ----------------------------------------- | -------------------------- |
| S3 Upload         | `POST /api/s3/upload/init/`               | `s3-upload-service.ts`     |
| Upload Confirm    | `POST /api/s3/upload/confirm/`            | `s3-upload-service.ts`     |
| Video List        | `GET /api/videos/`                        | `video-service.ts`         |
| Video Detail      | `GET /api/videos/{id}/`                   | `video-service.ts`         |
| Analysis Progress | `GET /api/videos/{id}/analysis/progress/` | `ai-service.ts`            |
| RAG Query         | `POST /api/search/events/query/`          | `vector-search-service.ts` |
| VLM Chat          | `POST /api/ai/vlm/respond/`               | `ai-service.ts`            |
| Generate Summary  | `POST /api/ai/summary/generate/`          | `ai-service.ts`            |
| Event List        | `GET /api/events/?video_id={id}`          | `event-service.ts`         |
| Session History   | `GET /api/sessions/`                      | `history-service.ts`       |

### Environment Variables

```env
# .env.production
NEXT_PUBLIC_API_BASE=http://backend:8000  # ECS Fargate internal DNS
NEXT_PUBLIC_AWS_REGION=ap-northeast-2
NEXT_PUBLIC_S3_BUCKET=deepsentinel-videos
```

### Local Development Proxy

```javascript
// next.config.mjs
module.exports = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ];
  },
};
```

---

## UX/UI Enhancements

### 1. Toast Notification System

**Implementation:** [ToastNotification.tsx](components/feedback/ToastNotification.tsx) + [useToast.ts](hooks/useToast.ts)

```typescript
// Usage
const { addToast } = useToast();

addToast({
  type: 'success',
  title: 'Upload Complete',
  message: 'Your video has been uploaded successfully',
  duration: 5000,
});
```

**Features:**

- ✅ **4 Types** - Success (green), Error (red), Warning (yellow), Info (cyan)
- ✅ **Auto-dismiss** - Configurable timeout (default 5s)
- ✅ **Slide-in Animation** - Smooth entrance/exit transitions
- ✅ **Duplicate Prevention** - Prevents same toast from showing twice
- ✅ **Manual Close** - X button for dismissal

**Toast Types:**

| Type    | Icon          | Color  | Use Case                            |
| ------- | ------------- | ------ | ----------------------------------- |
| Success | ✓ CheckCircle | Green  | Upload complete, Analysis done      |
| Error   | ✗ XCircle     | Red    | Upload failed, API error            |
| Warning | ⚠ AlertCircle | Yellow | Slow network, Large file warning    |
| Info    | ℹ Info        | Cyan   | Analysis started, Processing update |

### 2. Animation System

**Border Glow Animations:**

```css
/* Upload Section - Purple glow during upload */
@keyframes borderGlowPurple {
  0%,
  100% {
    box-shadow: 0 0 20px rgba(108, 92, 231, 0.5);
  }
  50% {
    box-shadow: 0 0 40px rgba(108, 92, 231, 0.8);
  }
}

/* Analysis Section - Cyan glow during processing */
@keyframes borderGlowGreen {
  0%,
  100% {
    box-shadow: 0 0 20px rgba(0, 230, 180, 0.5);
  }
  50% {
    box-shadow: 0 0 40px rgba(0, 230, 180, 0.8);
  }
}
```

**Progress Animations:**

```tsx
// Circular progress overlay
<div className="relative w-24 h-24 md:w-32 md:h-32">
  <svg className="transform -rotate-90">
    <circle
      cx="50%"
      cy="50%"
      r="40%"
      stroke="#6c5ce7"
      strokeWidth="4"
      fill="transparent"
      strokeDasharray={circumference}
      strokeDashoffset={offset}
      className="transition-all duration-300 ease-out"
    />
  </svg>
  <span className="text-[#6c5ce7] font-bold text-lg md:text-xl">
    {uploadProgress}%
  </span>
</div>
```

**Transition Classes:**

```tsx
// Smooth color transitions on hover
className = 'transition-colors duration-200 hover:bg-[#5a4fcf]';

// Layout shift animations
className = 'transition-all duration-500';

// Smooth fade effects
className = 'transition-opacity duration-300 ease-in-out';
```

### 3. Responsive Design

**Tailwind Breakpoints:**

| Breakpoint | Min Width | Usage               |
| ---------- | --------- | ------------------- |
| `sm:`      | 640px     | Small tablets       |
| `md:`      | 768px     | Tablets (most used) |
| `lg:`      | 1024px    | Desktops            |
| `xl:`      | 1280px    | Large screens       |

**Examples:**

```tsx
// Video player responsive sizing
<Card className="mb-4 md:mb-6">
  <CardContent className="p-4 md:p-6">
    <div className="relative w-24 h-24 md:w-32 md:h-32">
      {/* Smaller on mobile, larger on desktop */}
    </div>
  </CardContent>
</Card>

// Button responsive sizing
<Button className="h-8 w-8 md:h-10 md:w-10">
  <Play className="h-3 w-3 md:h-4 md:w-4" />
</Button>

// Text responsive sizing
<p className="text-sm md:text-base">
  {/* 14px on mobile, 16px on desktop */}
</p>
```

**Mobile Detection:**

```typescript
// hooks/use-mobile.tsx
export const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
};
```

### 4. Loading States

**Upload Progress:**

- Circular progress indicator (0-100%)
- Stage labels ("Uploading to S3...", "Confirming upload...")
- Border glow animation (purple)

**Analysis Progress:**

- Circular progress indicator (0-100%)
- Stage labels ("Analyzing video...", "Processing events...")
- Border glow animation (cyan)

**Skeleton Loaders:**

```tsx
// Video list loading state
{
  isLoading && (
    <div className="animate-pulse">
      <div className="h-48 bg-gray-700 rounded-lg" />
      <div className="h-4 bg-gray-700 rounded mt-2" />
    </div>
  );
}
```

### 5. Error Handling

**Global Error Boundary:**

```tsx
// components/feedback/ErrorBoundary.tsx
class ErrorBoundary extends React.Component {
  componentDidCatch(error, errorInfo) {
    console.error('Global error:', error, errorInfo);
    this.setState({ hasError: true });
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
```

**API Error Handling:**

```typescript
try {
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
} catch (error) {
  addToast({
    type: 'error',
    title: 'API Error',
    message: error.message || 'Unknown error occurred',
  });
}
```

---

## Environment Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Docker (for deployment)

### Installation

```bash
# Clone repository
cd front/

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Set environment variables
NEXT_PUBLIC_API_BASE=http://localhost:8000
NEXT_PUBLIC_AWS_REGION=ap-northeast-2
NEXT_PUBLIC_S3_BUCKET=your-bucket-name
```

### Local Development

```bash
# Run development server
npm run dev

# Access application
# http://localhost:3000
```

### Build

```bash
# Production build
npm run build

# Preview production build
npm start
```

### Type Checking

```bash
# Run TypeScript compiler
npm run type-check

# Run ESLint
npm run lint
```

---

## Development Guide

### Adding New Features

#### 1. Create API Action

```typescript
// app/actions/my-service.ts
'use server';

export async function myApiCall(params: MyParams) {
  const response = await fetch(`${API_BASE}/api/my-endpoint/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return response.json();
}
```

#### 2. Create Custom Hook

```typescript
// hooks/useMyFeature.ts
import { useState } from 'react';
import { myApiCall } from '@/app/actions/my-service';

export const useMyFeature = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async (params) => {
    setLoading(true);
    try {
      const result = await myApiCall(params);
      setData(result);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, fetchData };
};
```

#### 3. Create Component

```typescript
// components/my-feature/MyComponent.tsx
'use client';

import { useMyFeature } from '@/hooks/useMyFeature';

export default function MyComponent() {
  const { data, loading, fetchData } = useMyFeature();

  return (
    <div>{loading ? <LoadingSpinner /> : <DataDisplay data={data} />}</div>
  );
}
```

### Component Guidelines

**File Naming:**

- Components: PascalCase (`VideoPlayer.tsx`)
- Hooks: camelCase with `use` prefix (`useFileUpload.ts`)
- Actions: kebab-case (`s3-upload-service.ts`)

**Import Order:**

```typescript
// 1. React imports
import { useState, useEffect } from 'react';

// 2. Next.js imports
import Link from 'next/link';
import Image from 'next/image';

// 3. Third-party imports
import { Button } from '@/components/ui/button';

// 4. Local imports
import { useFileUpload } from '@/hooks/useFileUpload';
import type { Video } from '@/types/video';
```

**TypeScript Types:**

```typescript
// types/video.ts
export interface UploadedVideo {
  id: number;
  filename: string;
  s3_key: string;
  uploaded_at: string;
  duration: number;
  analysis_progress: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}
```

### Styling Guidelines

**Use Tailwind Utility Classes:**

```tsx
// ✅ Good
<div className="flex items-center gap-2 p-4 bg-gray-800 rounded-lg">

// ❌ Avoid inline styles
<div style={{ display: 'flex', padding: '16px' }}>
```

**Responsive Design:**

```tsx
// Mobile-first approach
<div className="text-sm md:text-base lg:text-lg">
  {/* 14px → 16px → 18px */}
</div>
```

**Theme Colors:**

```tsx
// Primary: Purple
className = 'bg-[#6c5ce7] text-white';

// Secondary: Cyan
className = 'bg-[#00e6b4] text-white';

// Background: Dark gray
className = 'bg-[#1a1f2c] text-gray-300';
```

---

## Deployment

### Docker Build

```dockerfile
# Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
RUN npm ci --production

EXPOSE 3000
CMD ["npm", "start"]
```

### Build & Push to ECR

```powershell
# scripts/build-frontend.ps1
$REGION = "ap-northeast-2"
$ACCOUNT_ID = "your-account-id"
$ECR_REPO = "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/deepsentinel-frontend"

# Docker build
docker build -t deepsentinel-frontend:latest ./front/

# ECR login
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_REPO

# Tag and push
docker tag deepsentinel-frontend:latest $ECR_REPO:latest
docker push $ECR_REPO:latest
```

### ECS Fargate Deployment

**Task Definition:**

```json
{
  "family": "deepsentinel-frontend",
  "containerDefinitions": [
    {
      "name": "frontend",
      "image": "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/deepsentinel-frontend:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NEXT_PUBLIC_API_BASE",
          "value": "http://backend:8000"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/deepsentinel-frontend",
          "awslogs-region": "ap-northeast-2",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ],
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024"
}
```

**Service Configuration:**

- **Target Group**: Port 3000 health check
- **Load Balancer**: ALB with path-based routing
- **Auto Scaling**: 1-3 tasks based on CPU/Memory
- **Deployment**: Rolling update, 100% health check

---

## Troubleshooting

### Common Issues

**1. API Connection Error**

```bash
# Check backend connectivity
curl http://localhost:8000/api/health/

# Verify environment variable
echo $NEXT_PUBLIC_API_BASE
```

**2. Upload Progress Not Updating**

```typescript
// Check XMLHttpRequest support
if (!('XMLHttpRequest' in window)) {
  console.error('XMLHttpRequest not supported');
}

// Verify progress event listener
xhr.upload.addEventListener('progress', (e) => {
  console.log('Progress:', e.loaded, e.total);
});
```

**3. Analysis Polling Not Starting**

```typescript
// Check polling initialization
console.log('Polling interval:', progressIntervalRef.current);

// Verify backend response
const data = await getAnalysisProgress(videoId);
console.log('Progress data:', data);
```

**4. Toast Not Showing**

```typescript
// Verify toast provider
<ToastNotification toasts={toasts} onRemove={removeToast} />;

// Check toast state
console.log('Current toasts:', toasts);
```

### Development Tips

- **Hot Reload Issues**: Clear `.next/` cache and restart dev server
- **Type Errors**: Run `npm run type-check` before committing
- **API CORS**: Ensure backend allows Next.js origin in development
- **Mobile Testing**: Use Chrome DevTools device emulation

---

## Performance Optimization

### Next.js Optimizations

```javascript
// next.config.mjs
module.exports = {
  images: {
    domains: ['your-s3-bucket.s3.amazonaws.com'],
    formats: ['image/avif', 'image/webp'],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
};
```

### Code Splitting

- **Dynamic Imports**: Large components loaded on-demand
- **Route-based Splitting**: Automatic with App Router
- **Server Components**: Default rendering strategy

### Bundle Size

```bash
# Analyze bundle
npm run build
# Check .next/analyze/ output
```

---

## Related Documentation

- [Backend README](../back/README.md) - Django REST API documentation
- [Batch README](../batch/README.md) - GPU video analysis worker
- [Lambda README](../lambda/README.md) - SQS to Batch trigger function
- [Terraform README](../terraform/README.md) - Infrastructure as Code

---

## License

This project is part of the DeepSentinel unmanned store monitoring system.
