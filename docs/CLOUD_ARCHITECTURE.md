# 🏗️ DeepSentinel Cloud Architecture

**AI-Powered CCTV Video Analysis Platform - Complete Infrastructure Diagram**

> 작성일: 2026년 1월 26일  
> AWS Region: ap-northeast-2 (Seoul)  
> Total Resources: 153 AWS Resources (Terraform Managed)

---

## 📐 Overall Architecture

```mermaid
graph TB
    subgraph CICD["🔧 CI/CD & IaC Pipeline (Left Zone)"]
        direction TB

        Dev["👨‍💻 Developer<br/>Local Machine"]
        GitHub["📦 GitHub Repository<br/>+ GitHub Actions"]

        subgraph TerraformBackend["🗄️ Terraform Backend"]
            S3State["S3 Bucket<br/>terraform-state-backup<br/>📄 tfstate 저장"]
            DynamoDB["DynamoDB Table<br/>terraform-state-lock<br/>🔒 동시성 제어"]
        end

        subgraph GitHubActions["🤖 GitHub Actions Workflows"]
            TerraformCI["Terraform CI<br/>fmt → init → plan<br/>🤖 AI 분석"]
            Deploy["Deploy Pipeline<br/>🛡️ Trivy → Build → ECS<br/>🤖 AI 장애 분석"]
            Infracost["Infracost<br/>💰 비용 영향 분석"]
            CodeQuality["Code Quality<br/>Black, Flake8, Bandit"]
        end

        Bedrock1["🤖 AWS Bedrock<br/>Claude AI<br/>- Plan 분석<br/>- 장애 진단"]
        Trivy["🛡️ Trivy Scanner<br/>보안 취약점 검사"]
        ECR["📦 Amazon ECR<br/>Container Registry<br/>- frontend<br/>- backend<br/>- batch-processor"]

        Dev --> GitHub
        GitHub --> TerraformCI
        GitHub --> Deploy
        GitHub --> Infracost
        GitHub --> CodeQuality

        TerraformCI --> TerraformBackend
        TerraformCI --> Bedrock1
        Deploy --> Trivy
        Deploy --> Bedrock1
        Deploy --> ECR

        S3State -.-> DynamoDB
    end

    subgraph AWS["☁️ AWS Cloud Infrastructure (Right Zone)"]
        direction TB

        Internet["🌐 Internet<br/>Users"]

        subgraph DNS["🌍 Global Services"]
            Route53["Route53<br/>deepsentinel.cloud"]
            ACM["ACM Certificate<br/>SSL/TLS"]
        end

        subgraph VPC["🏢 VPC: 10.0.0.0/16<br/>ap-northeast-2"]
            direction TB

            IGW["Internet Gateway"]

            subgraph PublicSubnet["🟢 Public Subnet (Multi-AZ)"]
                direction TB
                ALB["⚖️ Application LB<br/>+ Target Groups<br/>Port: 80, 443"]

                subgraph ECSCluster["📦 ECS Fargate Cluster"]
                    Frontend["Frontend Service<br/>Next.js 15<br/>Auto Scaling: 1-3<br/>Port: 3000"]
                    Backend["Backend Service<br/>Django 5.2<br/>Auto Scaling: 1-3<br/>Port: 8000"]
                end

                BatchCompute["🎮 AWS Batch<br/>GPU Compute Env<br/>g5.xlarge (A10G)<br/>Auto Scale: 0-4"]
            end

            subgraph PrivateSubnet["🔵 Private Subnet (Multi-AZ)"]
                direction TB
                RDS["🗄️ RDS PostgreSQL 16<br/>+ pgvector Extension<br/>db.t3.micro<br/>Port: 5432"]
            end

            subgraph DataPipeline["🔄 Data Processing Pipeline"]
                direction LR
                S3Raw["📹 S3: raw-videos<br/>원본 영상 업로드"]
                SQS["📬 SQS Queue<br/>video-processing<br/>+ DLQ"]
                Lambda["⚡ Lambda Function<br/>sqs-to-batch<br/>중복 방지 로직"]
                S3Thumb["🖼️ S3: thumbnails"]
                S3High["⭐ S3: highlights<br/>주요 이벤트 프레임"]

                S3Raw --> SQS
                SQS --> Lambda
                Lambda --> BatchCompute
            end

            IGW --> ALB
            ALB --> Frontend
            ALB --> Backend
            Frontend --> Backend
            Backend --> RDS
            BatchCompute --> RDS
            BatchCompute --> S3High
            Backend --> S3Raw
            Backend --> S3Thumb
        end

        subgraph ExternalServices["🌟 AWS Managed Services (Outside VPC)"]
            Bedrock2["🤖 AWS Bedrock<br/>- Claude 3 Haiku<br/>- Titan Embeddings<br/>- Reranker Model"]
            Secrets["🔐 Secrets Manager<br/>- DB Credentials<br/>- Django Secret"]
            CloudWatch["📊 CloudWatch<br/>Logs & Metrics"]
        end

        Internet --> Route53
        Route53 --> ACM
        Route53 --> ALB

        Backend --> Bedrock2
        Backend --> Secrets
        BatchCompute --> Secrets
        Frontend --> CloudWatch
        Backend --> CloudWatch
        BatchCompute --> CloudWatch
    end

    ECR -.->|Deploy| Frontend
    ECR -.->|Deploy| Backend
    ECR -.->|Deploy| BatchCompute

    TerraformBackend -.->|"terraform apply"| VPC

    style CICD fill:#e1f5ff,stroke:#0288d1,stroke-width:3px
    style AWS fill:#fff3e0,stroke:#f57c00,stroke-width:3px
    style VPC fill:#f1f8e9,stroke:#689f38,stroke-width:2px
    style PublicSubnet fill:#e8f5e9,stroke:#4caf50,stroke-width:2px
    style PrivateSubnet fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    style DataPipeline fill:#fff9c4,stroke:#fbc02d,stroke-width:2px
    style TerraformBackend fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    style GitHubActions fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    style ExternalServices fill:#ede7f6,stroke:#512da8,stroke-width:2px
```

---

## 🔄 Complete Data Flow

### 1️⃣ **개발 & 배포 플로우** (CI/CD)

```mermaid
sequenceDiagram
    participant Dev as 👨‍💻 Developer
    participant Git as GitHub
    participant Actions as GitHub Actions
    participant Terraform as Terraform Backend
    participant Bedrock as AWS Bedrock
    participant AWS as AWS Cloud

    Dev->>Git: git push (코드 변경)
    Git->>Actions: PR 생성 (Trigger)

    rect rgb(230, 240, 255)
        Note over Actions: Terraform CI Workflow
        Actions->>Terraform: terraform init (S3 Backend 연결)
        Actions->>Terraform: terraform plan (변경 시뮬레이션)
        Actions->>Bedrock: AI 분석 요청 (Plan 결과)
        Bedrock-->>Actions: 분석 결과 (변경 영향, 비용, 경고)
        Actions->>Git: PR 코멘트 + Issue 생성
    end

    rect rgb(255, 240, 230)
        Note over Actions: Deploy Pipeline (Merge 후)
        Actions->>Actions: Trivy 보안 스캔
        Actions->>Actions: Docker Build (Frontend/Backend)
        Actions->>AWS: ECR Push → ECS Deploy

        alt 배포 실패 시
            Actions->>Bedrock: 장애 로그 분석
            Bedrock-->>Actions: 원인 진단 + 해결책
            Actions->>Git: 장애 리포트 Issue 생성
        end
    end
```

### 2️⃣ **영상 분석 플로우** (Video Processing)

```mermaid
sequenceDiagram
    participant User as 🧑 사용자
    participant Front as Frontend<br/>(Next.js)
    participant Back as Backend<br/>(Django)
    participant S3 as S3 Bucket
    participant SQS as SQS Queue
    participant Lambda as Lambda Function
    participant Batch as AWS Batch<br/>(GPU)
    participant RDS as PostgreSQL
    participant Bedrock as Bedrock<br/>(RAG)

    User->>Front: 영상 업로드 요청
    Front->>Back: Presigned URL 요청
    Back->>S3: Generate Presigned URL
    Back-->>Front: Presigned URL 반환
    Front->>S3: 직접 업로드 (S3)
    Front->>Back: 업로드 확인

    rect rgb(255, 250, 230)
        Note over Back,Batch: Serverless GPU Pipeline
        Back->>SQS: 메시지 발행 (video_id, s3_key)
        SQS->>Lambda: 자동 트리거 (Event Source Mapping)
        Lambda->>Lambda: 중복 작업 체크
        Lambda->>Batch: Job 제출 (GPU 프로비저닝)

        Note over Batch: g5.xlarge GPU 인스턴스 시작<br/>(3분 Cold Start)

        Batch->>S3: 영상 다운로드
        Batch->>Batch: AI 분석 (YOLO + MiVOLO + MEBOW + LLaVA)
        Batch->>RDS: 이벤트 데이터 저장
        Batch->>S3: 주요 프레임 업로드 (highlights)
    end

    rect rgb(240, 255, 240)
        Note over User,Bedrock: RAG 기반 자연어 검색
        User->>Front: "3~5분 사이 도난 사건?"
        Front->>Back: Query 요청
        Back->>RDS: Vector Search (pgvector)
        Back->>Bedrock: Reranker + Claude 요약
        Bedrock-->>Back: 자연어 응답
        Back-->>Front: 검색 결과 반환
        Front-->>User: 타임라인 + 이벤트 표시
    end
```

---

## 📊 Infrastructure Components Breakdown

### **Network Layer** (30 Resources)

| 리소스           | 수량                | 용도                           |
| ---------------- | ------------------- | ------------------------------ |
| VPC              | 1                   | 격리된 네트워크 환경           |
| Public Subnet    | 2                   | Multi-AZ (ap-northeast-2a, 2c) |
| Private Subnet   | 2                   | Multi-AZ (RDS 배치)            |
| Internet Gateway | 1                   | 외부 통신                      |
| Route Tables     | 2 + 4 associations  | Public/Private 라우팅          |
| Security Groups  | 4                   | ALB, ECS, Batch, RDS           |
| ALB              | 1 + 2 Target Groups | 로드밸런싱                     |
| Listeners        | 2                   | HTTP (80), HTTPS (443)         |
| Route53          | 1 Zone + 3 Records  | DNS 관리                       |
| ACM Certificate  | 1 + Validation      | SSL/TLS                        |

### **Compute Layer** (35 Resources)

| 리소스                | 수량 | 스펙                          | 용도                     |
| --------------------- | ---- | ----------------------------- | ------------------------ |
| ECS Cluster           | 1    | -                             | 컨테이너 오케스트레이션  |
| ECS Fargate Services  | 2    | 0.5 vCPU + 1GB / 1 vCPU + 2GB | Frontend, Backend        |
| Auto Scaling          | 4    | Target + Policy               | CPU 기반 (1-3 tasks)     |
| ECR Repositories      | 3    | -                             | frontend, backend, batch |
| AWS Batch Compute Env | 1    | g5.xlarge (0-4 instances)     | GPU 영상 분석            |
| Batch Job Queue       | 1    | Priority: 10                  | 작업 대기열              |
| CloudWatch Log Groups | 5    | -                             | 로그 수집                |

### **Storage Layer** (25 Resources)

| 리소스          | 수량 | 크기               | 용도                                                                |
| --------------- | ---- | ------------------ | ------------------------------------------------------------------- |
| S3 Buckets      | 5    | -                  | raw-videos, thumbnails, highlights, terraform-state, analysis-model |
| Bucket Policies | 5    | -                  | IAM 기반 접근 제어                                                  |
| RDS PostgreSQL  | 1    | db.t3.micro (20GB) | 메인 데이터베이스 + pgvector                                        |
| Secrets Manager | 2    | -                  | DB Password, Django Secret                                          |

### **Pipeline Layer** (40 Resources)

| 리소스               | 수량    | 용도                      |
| -------------------- | ------- | ------------------------- |
| SQS Queue            | 1 + DLQ | 비동기 메시지 처리        |
| Lambda Function      | 1       | SQS → Batch 트리거        |
| Batch Job Definition | 2       | GPU, CPU 작업 정의        |
| CloudWatch Alarms    | 2       | DLQ, Queue Depth 모니터링 |

### **Security Layer** (15 IAM Roles)

| 역할                    | 수량         | 용도                               |
| ----------------------- | ------------ | ---------------------------------- |
| ECS Task Execution/Role | 2 + Policies | 컨테이너 실행 권한                 |
| Batch Roles             | 5            | Service, Execution, Task, Instance |
| Lambda Role             | 1            | SQS 읽기 + Batch 제출              |
| Instance Profiles       | 2            | EC2 역할 연결                      |

### **IAM Users & Groups** (8 Resources)

| 유형            | 이름                                    | 권한                |
| --------------- | --------------------------------------- | ------------------- |
| Admin Group     | admins                                  | AdministratorAccess |
| Developer Group | developers                              | PowerUserAccess     |
| Users           | siheon_admin, seungbeom_dev, doyeon_dev | 그룹별 권한 상속    |
| CI/CD User      | github_actions                          | ECR + ECS Deploy    |

---

## 🔐 Security Architecture

```mermaid
graph TD
    subgraph SecurityLayers["🛡️ Multi-Layer Security"]
        direction TB

        L1["Layer 1: Network<br/>Security Groups + VPC Isolation"]
        L2["Layer 2: IAM<br/>최소 권한 원칙 (Least Privilege)"]
        L3["Layer 3: Secrets<br/>Secrets Manager + 암호화"]
        L4["Layer 4: Application<br/>Trivy 보안 스캔 + HTTPS"]
        L5["Layer 5: Data<br/>S3 암호화 + RDS 백업"]

        L1 --> L2 --> L3 --> L4 --> L5
    end

    subgraph AccessControl["🔒 접근 제어"]
        direction LR

        SG1["ALB SG<br/>0.0.0.0/0:443"]
        SG2["ECS Tasks SG<br/>ALB:3000,8000"]
        SG3["RDS SG<br/>ECS:5432"]
        SG4["Batch SG<br/>VPC Internal"]

        SG1 --> SG2 --> SG3
        SG1 --> SG4
    end

    style SecurityLayers fill:#ffebee,stroke:#c62828,stroke-width:2px
    style AccessControl fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px
```

---

## 💰 Cost Optimization Strategy

### **Before Optimization** (기존 아키텍처)

```
❌ NAT Gateway: $44.36/month
❌ VPC Endpoints: $29.34/month
❌ 24/7 GPU EC2: $723/month
────────────────────────────────
Total: ~$797/month
```

### **After Optimization** (현재 아키텍처)

```
✅ Public Subnet ECS: $0 (NAT 불필요)
✅ AWS Batch GPU (On-Demand): $1-3/video
✅ ECS Fargate: ~$30/month
✅ RDS t3.micro: ~$15/month
────────────────────────────────
Total: ~$45/month + 사용량 기반
💰 절감율: 94% (월 $752 절감)
```

### **Serverless GPU 비용 모델**

```
월 100개 영상 처리 기준:
- GPU 시간: 100 videos × 15min × $1.006/hour = $25.15
- 총 비용: $45 (고정) + $25 (변동) = $70/month

vs 24/7 GPU 서버: $723/month
→ 90% 비용 절감 ✅
```

---

## 📈 Scalability & Performance

```mermaid
graph LR
    subgraph AutoScaling["🚀 Auto Scaling Strategy"]
        direction TB

        ECS["ECS Fargate<br/>CPU 70% 기준<br/>1 → 3 tasks"]
        Batch["AWS Batch<br/>Queue Depth 기준<br/>0 → 4 GPU instances"]
        RDS["RDS<br/>Read Replica (필요 시)"]

        ECS -.->|수평 확장| ECS
        Batch -.->|수직 확장| Batch
    end

    subgraph Performance["⚡ 성능 지표"]
        direction TB

        P1["부하 테스트: 50 VUs<br/>성공률: 99.93%<br/>p95: 472ms"]
        P2["GPU 처리 속도<br/>2-3초/프레임<br/>평균 15분/영상"]
        P3["Cold Start<br/>Custom AMI 활용<br/>20분 → 3분"]
    end

    style AutoScaling fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style Performance fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
```

---

## 🔄 CI/CD Pipeline Details

### **GitHub Actions Workflows**

#### 1. **Terraform CI** (terraform.yml)

```yaml
Trigger: Pull Request (terraform/**)
Steps: ✓ terraform fmt -check
  ✓ terraform init (S3 Backend)
  ✓ terraform plan
  ✓ AWS Bedrock AI 분석
  ✓ GitHub Issue 생성
  ✓ PR 코멘트 (Plan 결과)
```

#### 2. **Deploy Pipeline** (deploy.yml)

```yaml
Trigger: Push to main
Steps:
  ✓ Trivy Security Scan (CRITICAL/HIGH)
  ✓ Docker Build (Frontend + Backend)
  ✓ ECR Push
  ✓ ECS Deploy (Rolling Update)

  On Failure:
    → CloudWatch Logs 수집
    → Bedrock AI 장애 분석
    → GitHub Issue 자동 생성
```

#### 3. **Infracost** (infracost.yml)

```yaml
Trigger: PR on terraform/**
Steps: ✓ 현재 인프라 비용 계산
  ✓ 변경 후 예상 비용 계산
  ✓ Diff 결과 PR 코멘트
```

#### 4. **Batch Monitor** (batch-monitor.yml)

```yaml
Schedule: Daily 09:00 KST
Steps: ✓ AWS Batch 작업 상태 확인
  ✓ 실패 작업 로그 수집
  ✓ 비용 리포트 생성
  ✓ Slack 알림 (설정 시)
```

---

## 🎯 Key Architectural Decisions

### **1. Public Subnet ECS (NAT Gateway 제거)**

- **이유**: NAT Gateway 월 $44 절감
- **보안**: Security Group으로 인바운드 차단 (ALB만 허용)
- **Trade-off**: 외부 API 호출 시 공인 IP 노출 (현재 프로젝트에는 영향 없음)

### **2. AWS Batch GPU (24/7 EC2 대체)**

- **이유**: 사용량 기반 과금으로 90% 비용 절감
- **Cold Start 최적화**: Custom AMI (AI 모델 pre-load) → 20분 → 3분
- **Trade-off**: 즉시 처리 불가 (3분 대기), 허용 가능

### **3. Terraform Modular Architecture**

- **이유**: 유지보수성, 재사용성, 팀 협업
- **구조**: 6개 모듈 (network, storage, security, compute, pipeline, iam)
- **마이그레이션**: 200+ `moved` blocks으로 무중단 전환

### **4. DevSecOps Pipeline**

- **Shift-Left Security**: Trivy 빌드 단계 스캔 (배포 전 차단)
- **AI-Powered Ops**: Bedrock으로 장애 자동 진단
- **FinOps Automation**: Infracost PR 통합

---

## 📚 Related Documentation

- [Terraform Refactoring Guide](02_infrastructure/TERRAFORM_REFACTORING.md)
- [GitHub Actions CI/CD](05_devops/GITHUB_ACTIONS_TERRAFORM_CI_2026-01-16.md)
- [DevSecOps Pipeline](05_devops/DEVSECOPS_PIPELINE_IMPLEMENTATION.md)
- [Cost Optimization](04_cost_optimization/COST_REDUCTION_JAN_2026.md)
- [Infrastructure Overview](../INFRA.md)

---

**Last Updated**: 2026년 1월 26일  
**Maintained by**: DeepSentinel Team
