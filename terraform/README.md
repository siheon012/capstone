# Terraform Infrastructure

Modular Infrastructure as Code (IaC) for DeepSentinel - AI-powered unmanned store CCTV video analysis platform.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Before & After Refactoring](#before--after-refactoring)
- [Module Structure](#module-structure)
- [Zero-Downtime Migration](#zero-downtime-migration)
- [Usage](#usage)
- [State Management](#state-management)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

This Terraform configuration manages **153 AWS resources** across a modular, maintainable infrastructure using **6 specialized modules**.

### Key Features

- ✅ **Modular Design**: Network, Storage, Security, Compute, Pipeline, IAM layers
- ✅ **Zero-Downtime Migration**: Used `moved` blocks to refactor without destroying resources
- ✅ **Environment Agnostic**: Reusable modules for dev/staging/prod
- ✅ **S3 Remote State**: Centralized state storage with versioning
- ✅ **Comprehensive IAM**: Centralized security management

### Infrastructure Stats

- **Total Resources**: 153 AWS resources
- **Modules**: 6 specialized modules
- **Moved Blocks**: 200+ for seamless migration
- **State Backups**: 6 timestamped backups + S3 versioning

---

## Architecture

### High-Level Infrastructure

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓ HTTPS
┌─────────────────────────────────────────────────────────────────┐
│  Route53 (deepsentinel.cloud)                                   │
│  - Frontend: deepsentinel.cloud                                 │
│  - API: api.deepsentinel.cloud                                  │
│  - ACM Certificate (SSL/TLS)                                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Application Load Balancer (Public Subnets)                     │
│  - Target Group: Frontend (Port 3000)                           │
│  - Target Group: Backend (Port 8000)                            │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  ECS Fargate Cluster (Private Subnets)                          │
│  ├─ Frontend Service (Next.js 15)                               │
│  │  - Auto Scaling: 1-3 tasks                                   │
│  │  - CloudWatch Logs                                           │
│  └─ Backend Service (Django 5.2)                                │
│     - Auto Scaling: 1-3 tasks                                   │
│     - CloudWatch Logs                                           │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Video Processing Pipeline                                      │
│                                                                 │
│  User Upload → S3 → SQS → Lambda → AWS Batch (GPU)             │
│                                      ↓                          │
│                              Video Analysis                     │
│                              (g5.xlarge GPU)                    │
│                                      ↓                          │
│                              PostgreSQL + pgvector              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Data Layer (Private Subnets)                                   │
│  ├─ RDS PostgreSQL (db.t3.micro)                                │
│  │  - pgvector extension                                        │
│  │  - Multi-AZ backup                                           │
│  ├─ S3 Buckets                                                  │
│  │  - raw-videos (input)                                        │
│  │  - thumbnails (processed)                                    │
│  │  - highlights (critical events)                              │
│  └─ Secrets Manager                                             │
│     - DB credentials                                            │
│     - Django secret key                                         │
└─────────────────────────────────────────────────────────────────┘
```

### Module Dependency Graph

```
┌──────────────┐
│   Network    │  ← Foundation (VPC, Subnets, Security Groups, ALB)
└──────────────┘
       ↓
┌──────────────┐
│   Storage    │  ← Data Layer (S3, RDS, Secrets)
└──────────────┘
       ↓
┌──────────────┐
│   Security   │  ← IAM Roles (ECS, Batch, Lambda)
└──────────────┘
       ↓
┌──────────────┐  ┌──────────────┐
│   Compute    │  │   Pipeline   │  ← Application Layer
└──────────────┘  └──────────────┘
       ↓                 ↓
┌──────────────────────────────┐
│            IAM               │  ← User Management
└──────────────────────────────┘
```

---

## Before & After Refactoring

### Problem Statement (Before)

**Monolithic Structure** - All resources in flat file structure:

```
terraform/old_version/
├── vpc.tf                    # 200 lines
├── s3.tf                     # 180 lines
├── rds.tf                    # 120 lines
├── iam.tf                    # 435 lines (all IAM mixed)
├── ecs-fargate.tf            # 300 lines
├── batch.tf                  # 500+ lines (Batch + Lambda + SQS)
├── lambda.tf                 # 150 lines
├── sqs.tf                    # 100 lines
└── route53.tf                # 180 lines
```

**Issues**:

- ❌ **Large Files**: iam.tf = 435 lines, batch.tf = 500+ lines
- ❌ **Unclear Dependencies**: Implicit relationships scattered across files
- ❌ **High Risk**: Small change could affect entire infrastructure
- ❌ **No Reusability**: Must copy all files for new environments
- ❌ **Merge Conflicts**: Multiple developers editing same files

### Solution (After Refactoring)

**Modular Architecture** - Organized by responsibility:

```
terraform/
├── main.tf                      # 131 lines (module orchestration)
├── variables.tf                 # Global variables
├── outputs.tf                   # Global outputs
├── moved_blocks/                # Migration logic (569 + 100 lines)
│   ├── moved_blocks.tf          # Resource → Module moves
│   └── moved_blocks_iam.tf      # IAM-specific moves
│
└── modules/
    ├── network/                 # 458 lines (VPC, ALB, Route53)
    │   ├── main.tf
    │   ├── alb.tf
    │   ├── route53.tf
    │   └── outputs.tf
    ├── storage/                 # 320 lines (S3, RDS, Secrets)
    │   ├── s3.tf
    │   ├── rds.tf
    │   ├── secrets.tf
    │   └── outputs.tf
    ├── security/                # 435 lines (IAM roles only)
    │   └── iam.tf
    ├── compute/                 # 550 lines (ECR, ECS Fargate/GPU)
    │   ├── ecr.tf
    │   ├── ecs-fargate.tf
    │   ├── ecs-gpu.tf
    │   └── outputs.tf
    ├── pipeline/                # 680 lines (SQS, Lambda, Batch)
    │   ├── sqs.tf
    │   ├── lambda.tf
    │   ├── batch.tf
    │   ├── batch-video-analysis-gpu.tf
    │   └── outputs.tf
    └── iam/                     # 280 lines (User groups/policies)
        └── iam.tf
```

**Benefits**:

- ✅ **Smaller Files**: Average 200-300 lines per file
- ✅ **Clear Dependencies**: Module inputs/outputs document relationships
- ✅ **Isolated Changes**: Modify one module without affecting others
- ✅ **Reusable**: Share modules across dev/staging/prod
- ✅ **Parallel Work**: Developers work on separate modules

---

## Module Structure

### 1. Network Module

**Purpose**: Foundation networking infrastructure

<details>
<summary>👉 View Resources & Outputs (30 Resources)</summary>

**Resources** (30 total):

- VPC with DNS support
- 2 Public Subnets (ALB, NAT Gateway)
- 2 Private Subnets (ECS, RDS, Batch)
- Internet Gateway + NAT Gateway
- Route Tables & Associations
- Security Groups (ALB, ECS, RDS, Batch, VPC Endpoints)
- Application Load Balancer + Target Groups
- Route53 Hosted Zone + DNS Records
- ACM SSL Certificate + Validation
- VPC Endpoints (S3, ECR, CloudWatch Logs)

**Outputs**:

```hcl
vpc_id
public_subnet_ids
private_subnet_ids
alb_security_group_id
ecs_tasks_security_group_id
rds_security_group_id
batch_compute_security_group_id
alb_dns_name
frontend_target_group_arn
backend_target_group_arn
```

**Used By**: All modules (foundation layer)

</details>

---

### 2. Storage Module

**Purpose**: Data persistence and secrets management

<details>
<summary>👉 View Resources & Outputs (25 Resources)</summary>

**Resources** (25 total):

- **S3 Buckets**: raw-videos, thumbnails, highlights, terraform-state
- **S3 Configurations**: Versioning, Encryption, CORS, Public Access Block
- **RDS PostgreSQL**: db.t3.micro with pgvector extension
- **Secrets Manager**: DB password, Django secret key
- **Random Passwords**: Auto-generated secure credentials

**Outputs**:

```hcl
s3_raw_videos_bucket
s3_raw_videos_arn
s3_thumbnails_arn
s3_highlights_bucket
s3_highlights_arn
db_host
db_port
db_name
db_user
db_password_secret_arn
django_secret_arn
```

**Used By**: Security, Compute, Pipeline modules

</details>

---

### 3. Security Module

**Purpose**: AWS service IAM roles (NOT user accounts)

<details>
<summary>👉 View Resources & Outputs (15 Resources)</summary>

**Resources** (15 total):

- **ECS Task Execution Role**: Pull ECR images, write CloudWatch logs, read Secrets
- **ECS Task Role**: Access S3, Bedrock, SQS during runtime
- **Batch Roles**: Service, Execution, Task, Instance roles
- **Lambda Role**: Trigger Batch jobs from SQS

**Key Principle**: All AWS service IAM roles centralized here

**Inputs** (from Storage):

```hcl
s3_raw_videos_arn
s3_thumbnails_arn
s3_highlights_arn
db_password_secret_arn
django_secret_arn
```

**Outputs**:

```hcl
ecs_task_execution_role_arn
ecs_task_role_arn
batch_service_role_arn
batch_execution_role_arn
batch_task_role_arn
batch_instance_profile_arn
lambda_sqs_to_batch_role_arn
```

**Used By**: Compute, Pipeline modules

</details>

---

### 4. Compute Module

**Purpose**: Container orchestration and execution

<details>
<summary>👉 View Resources & Outputs (35 Resources)</summary>

**Resources** (35 total):

- **ECR Repositories**: frontend, backend
- **ECS Cluster**: Shared by Fargate and GPU EC2
- **Fargate Services**: Frontend (Next.js), Backend (Django)
- **Auto Scaling**: CPU-based scaling (1-3 tasks)
- **GPU EC2 Auto Scaling Group**: For GPU-intensive tasks
- **Service Discovery**: Internal DNS for service-to-service communication
- **CloudWatch Log Groups**: Application logs

**Inputs**:

```hcl
# From Network
vpc_id, public_subnet_ids, private_subnet_ids
alb_target_group_backend_arn, alb_target_group_frontend_arn
ecs_tasks_security_group_id

# From Storage
s3_raw_videos_bucket, db_host, db_password_secret_arn

# From Security
ecs_task_execution_role_arn, ecs_task_role_arn
```

**Outputs**:

```hcl
ecs_cluster_id
ecs_cluster_arn
frontend_service_name
backend_service_name
backend_ecr_repository_url
frontend_ecr_repository_url
```

**Used By**: Pipeline module (shares ECS cluster)

</details>

---

### 5. Pipeline Module

**Purpose**: Video processing pipeline orchestration

<details>
<summary>👉 View Resources & Outputs (40 Resources)</summary>

**Resources** (40 total):

- **SQS Queues**: Main queue + Dead Letter Queue
- **S3 Event Notification**: Trigger on video upload
- **Lambda Function**: SQS → Batch job submission
- **Lambda Event Source Mapping**: Auto-poll SQS
- **AWS Batch Compute Environment**: g5.xlarge GPU instances
- **AWS Batch Job Queue**: Priority-based job scheduling
- **AWS Batch Job Definitions**: Video analysis container config
- **CloudWatch Alarms**: Queue depth, DLQ monitoring

**Data Flow**:

```
User Upload Video
  ↓
S3 (raw-videos bucket)
  ↓ (S3 Event Notification)
SQS Queue
  ↓ (Lambda Event Source Mapping)
Lambda Function (sqs-to-batch)
  ↓ (Batch Submit Job)
AWS Batch (g5.xlarge GPU)
  ↓
Video Analysis (YOLO + MiVOLO + MEBOW + LLaVA)
  ↓
PostgreSQL + pgvector
```

**Inputs**:

```hcl
# From Network
vpc_id, private_subnet_ids, batch_compute_security_group_id

# From Storage
s3_raw_videos_bucket, s3_raw_videos_arn
db_host, db_password_secret_arn

# From Compute
ecs_cluster_id, ecs_cluster_arn

# From Security
batch_service_role_arn, batch_execution_role_arn
batch_task_role_arn, batch_instance_profile_arn
lambda_sqs_to_batch_role_arn
```

**Outputs**:

```hcl
sqs_queue_url
sqs_queue_arn
lambda_function_arn
batch_job_definition_arn
batch_compute_environment_arn
```

</details>

---

### 6. IAM Module

**Purpose**: User account and developer access management

<details>
<summary>👉 View Resources & Outputs (8 Resources)</summary>

**Resources** (8 total):

- **IAM Groups**: admins, developers
- **IAM Users**: siheon-admin, seungbeom-dev, doyeon-dev, github-actions
- **Custom Policies**: Developer S3 access, GitHub Actions ECS deploy
- **Group Memberships**: User-to-group assignments

**Key Principle**: Separate from Security module (user accounts vs service roles)

**Inputs**:

```hcl
ecs_task_execution_role_arn  # from security
ecs_task_role_arn            # from security
s3_raw_videos_arn            # from storage
s3_thumbnails_arn            # from storage
```

**Outputs**:

```hcl
admin_group_arn
developer_group_arn
github_actions_user_arn
```

</details>

[⬆️ Back to Top](#table-of-contents)

---

## Zero-Downtime Migration

### The Challenge

Refactoring 153 resources from monolithic to modular structure **without destroying any existing infrastructure**.

### The Solution: Terraform `moved` Blocks

**moved** blocks tell Terraform to update the state file without touching AWS resources:

```hcl
moved {
  from = aws_vpc.main                    # Old address
  to   = module.network.aws_vpc.main     # New address
}
```

### Migration Strategy

#### Phase 1: Backup State

```powershell
# Backup current state
cp terraform.tfstate terraform.tfstate.before-module-migration-$(Get-Date -Format "yyyyMMdd-HHmmss")

# Upload to S3 (additional safety)
aws s3 cp terraform.tfstate s3://capstone-dev-terraform-state/backups/
```

**Existing Backups**:

```
terraform.tfstate                                    # Current
terraform.tfstate.backup                            # Auto-backup
terraform.tfstate.before-module-migration-20260109  # Migration backup
terraform.tfstate.before_restore                    # Restore point
terraform.tfstate.current_broken_backup             # Incident backup
terraform.tfstate.local_backup_20251229             # Local backup
```

#### Phase 2: Create Moved Blocks

**moved_blocks/moved_blocks.tf** (569 lines) - Resource migrations:

```hcl
# Network Module (30 moves)
moved { from = aws_vpc.main, to = module.network.aws_vpc.main }
moved { from = aws_subnet.public_1, to = module.network.aws_subnet.public_1 }
moved { from = aws_lb.main, to = module.network.aws_lb.main }
# ... 27 more

# Storage Module (40 moves)
moved { from = aws_s3_bucket.raw_videos, to = module.storage.aws_s3_bucket.raw_videos }
moved { from = aws_db_instance.postgres, to = module.storage.aws_db_instance.postgres }
moved { from = aws_secretsmanager_secret.db_password, to = module.storage.aws_secretsmanager_secret.db_password }
# ... 37 more

# Compute Module (50 moves)
moved { from = aws_ecs_cluster.main, to = module.compute.aws_ecs_cluster.main }
moved { from = aws_ecs_service.backend, to = module.compute.aws_ecs_service.backend }
moved { from = aws_ecr_repository.backend, to = module.compute.aws_ecr_repository.backend }
# ... 47 more

# Pipeline Module (35 moves)
moved { from = aws_sqs_queue.video_processing, to = module.pipeline.aws_sqs_queue.video_processing }
moved { from = aws_lambda_function.sqs_to_batch, to = module.pipeline.aws_lambda_function.sqs_to_batch }
moved { from = aws_batch_compute_environment.video_analysis_gpu, to = module.pipeline.aws_batch_compute_environment.video_analysis_gpu }
# ... 32 more
```

**moved_blocks/moved_blocks_iam.tf** (100 lines) - IAM migrations:

```hcl
# Security Module (AWS service IAM)
moved { from = aws_iam_role.ecs_task_execution_role, to = module.security.aws_iam_role.ecs_task_execution_role }
moved { from = aws_iam_role.batch_service_role, to = module.security.aws_iam_role.batch_service_role }
moved { from = aws_iam_role.lambda_sqs_to_batch, to = module.security.aws_iam_role.lambda_sqs_to_batch }
# ... 12 more

# IAM Module (user accounts)
moved { from = aws_iam_group.admins, to = module.iam.aws_iam_group.admins }
moved { from = aws_iam_user.siheon_admin, to = module.iam.aws_iam_user.siheon_admin }
moved { from = aws_iam_user.github_actions, to = module.iam.aws_iam_user.github_actions }
# ... 8 more
```

**Total**: 200+ moved blocks

#### Phase 3: Validate with Plan

```powershell
terraform plan

# Expected output:
# Plan: 0 to add, 0 to change, 0 to destroy.
#
# Terraform will perform the following actions:
#
#   # module.network.aws_vpc.main has moved from aws_vpc.main
#   # module.storage.aws_s3_bucket.raw_videos has moved from aws_s3_bucket.raw_videos
#   # ... (200+ move statements)
```

**Critical Check**: Must show `0 to destroy`!

If any resources show "will be destroyed":

- ❌ Missing `moved` block
- ❌ Resource name changed in module
- ❌ Attribute value changed (forces replacement)

#### Phase 4: Apply Migration

```powershell
terraform apply

# Output:
# Apply complete! Resources: 0 added, 0 changed, 0 destroyed.
#
# State file updated successfully.
# No AWS resources were modified.
```

**Result**: State file reorganized, zero downtime, all resources intact.

[⬆️ Back to Top](#table-of-contents)

---

## Usage

### Prerequisites

- Terraform >= 1.0
- AWS CLI configured
- AWS credentials with admin access

### Initial Setup

```powershell
# Clone repository
git clone <repo-url>
cd terraform

# Initialize Terraform
terraform init

# Create terraform.tfvars (copy from template)
cp terraform.tfvars.example terraform.tfvars

# Edit variables
notepad terraform.tfvars
```

### Terraform Variables

**terraform.tfvars**:

```hcl
account_id   = "123456789012"          # Your AWS account ID
region       = "ap-northeast-2"        # AWS region
environment  = "dev"                   # Environment name
domain_name  = "deepsentinel.cloud"    # Your domain (or "" if none)
vpc_cidr     = "10.0.0.0/16"          # VPC CIDR block
```

### Common Commands

#### Full Infrastructure Deployment

```powershell
# Plan changes
terraform plan -out=tfplan

# Apply changes
terraform apply tfplan

# Show current state
terraform show
```

#### Module-Specific Operations

```powershell
# Plan only Network module
terraform plan -target=module.network

# Apply only Compute module
terraform apply -target=module.compute

# Destroy only Pipeline module (dangerous!)
terraform destroy -target=module.pipeline
```

#### State Management

```powershell
# List all resources
terraform state list

# Show specific resource
terraform state show module.network.aws_vpc.main

# Move resource manually (if needed)
terraform state mv aws_vpc.main module.network.aws_vpc.main

# Remove resource from state (doesn't delete from AWS)
terraform state rm module.iam.aws_iam_user.old_user
```

### Updating Infrastructure

#### Scenario: Add new S3 bucket

```powershell
# 1. Edit module
notepad modules\storage\s3.tf

# 2. Add resource
resource "aws_s3_bucket" "new_bucket" {
  bucket = "capstone-${var.environment}-new-bucket"
  # ...
}

# 3. Add output
notepad modules\storage\outputs.tf

output "new_bucket_arn" {
  value = aws_s3_bucket.new_bucket.arn
}

# 4. Update main.tf to pass output to other modules (if needed)
notepad main.tf

module "security" {
  # ...
  new_bucket_arn = module.storage.new_bucket_arn
}

# 5. Plan and apply
terraform plan
terraform apply
```

#### Scenario: Update ECS task definition

```powershell
# 1. Edit Compute module
notepad modules\compute\ecs-fargate.tf

# 2. Modify task definition (e.g., increase memory)
resource "aws_ecs_task_definition" "backend" {
  memory = "1024"  # Changed from 512
  # ...
}

# 3. Plan changes (only Compute module affected)
terraform plan -target=module.compute

# 4. Apply
terraform apply -target=module.compute

# 5. ECS automatically triggers rolling update (zero downtime)
```

---

## State Management

### Remote State (S3)

State file is stored in S3 for team collaboration:

```hcl
# backend.tf (if configured)
terraform {
  backend "s3" {
    bucket         = "capstone-dev-terraform-state"
    key            = "terraform.tfstate"
    region         = "ap-northeast-2"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}
```

**Benefits**:

- ✅ Team collaboration (shared state)
- ✅ State locking (prevents concurrent modifications)
- ✅ Automatic versioning (S3 versioning enabled)
- ✅ Encryption at rest

### State Backups

**Local Backups** (6 files):

```
terraform.tfstate                                    # Current state
terraform.tfstate.backup                            # Last successful apply
terraform.tfstate.before-module-migration-20260109  # Pre-refactoring
terraform.tfstate.before_restore                    # Recovery point
terraform.tfstate.current_broken_backup             # Debug copy
terraform.tfstate.local_backup_20251229             # Manual backup
```

**S3 Backups**:

```
s3://capstone-dev-terraform-state/
├── terraform.tfstate                # Current
└── backups/
    ├── terraform.tfstate.20260109
    ├── terraform.tfstate.20251229
    └── ...
```

### State Recovery

```powershell
# Restore from local backup
cp terraform.tfstate.before-module-migration-20260109 terraform.tfstate
terraform plan  # Verify state

# Restore from S3
aws s3 cp s3://capstone-dev-terraform-state/backups/terraform.tfstate.20260109 terraform.tfstate
terraform plan  # Verify state
```

[⬆️ Back to Top](#table-of-contents)

---

## Best Practices

### 1. Module Design Principles

**Single Responsibility**: Each module has one clear purpose

```
✅ network/ → Networking only
✅ storage/ → Data storage only
❌ mixed/ → ECS + S3 + IAM (too broad)
```

**Explicit Dependencies**: Use module outputs, not data sources

```hcl
# ❌ Bad: Implicit dependency
data "aws_vpc" "main" { ... }

# ✅ Good: Explicit dependency
variable "vpc_id" {
  description = "VPC ID from network module"
}
```

**Unidirectional Flow**: Avoid circular dependencies

```
✅ Network → Storage → Security → Compute → Pipeline
❌ Compute → Storage → Compute (circular)
```

### 2. Naming Conventions

**Resources**:

```hcl
resource "aws_s3_bucket" "raw_videos" {  # snake_case
  bucket = "capstone-${var.environment}-raw-videos"  # kebab-case
}
```

**Modules**:

```
modules/network/  # lowercase, singular noun
modules/storage/  # not "storages"
```

**Tags**:

```hcl
tags = {
  Name        = "capstone-vpc"
  Environment = var.environment
  ManagedBy   = "Terraform"
  Module      = "network"
}
```

### 3. Variable Documentation

Always include description and type:

```hcl
variable "vpc_id" {
  description = "VPC ID from network module"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs from network module"
  type        = list(string)
}
```

### 4. Output Documentation

Include descriptions for reusability:

```hcl
output "vpc_id" {
  description = "ID of the VPC for use in other modules"
  value       = aws_vpc.main.id
}
```

### 5. Change Management

**Before Making Changes**:

1. ✅ Backup state file
2. ✅ Run `terraform plan` first
3. ✅ Review plan output carefully
4. ✅ Use `-target` for isolated changes
5. ✅ Test in dev before prod

**After Changes**:

1. ✅ Verify with `terraform show`
2. ✅ Test application functionality
3. ✅ Monitor CloudWatch logs
4. ✅ Document changes in Git commit

[⬆️ Back to Top](#table-of-contents)

---

## Troubleshooting

### Issue: "Error acquiring the state lock"

**Cause**: Another user is running Terraform, or previous run crashed

**Solution**:

```powershell
# Check who has the lock
aws dynamodb get-item `
  --table-name terraform-state-lock `
  --key '{"LockID":{"S":"capstone-dev-terraform-state/terraform.tfstate-md5"}}'

# Force unlock (if safe)
terraform force-unlock <LOCK_ID>
```

### Issue: "Resource will be destroyed"

**Cause**: Missing `moved` block or resource name changed

**Solution**:

```powershell
# 1. Check current state
terraform state list | Select-String "resource_name"

# 2. Check module code
notepad modules\<module>\<file>.tf

# 3. Add moved block
moved {
  from = old_address
  to   = new_address
}

# 4. Verify
terraform plan  # Should show 0 destroy
```

### Issue: "Error: Module not found"

**Cause**: Module path incorrect or not initialized

**Solution**:

```powershell
# Re-initialize modules
terraform init -upgrade

# Verify module paths in main.tf
notepad main.tf
```

### Issue: "Inconsistent dependency lock file"

**Cause**: Provider version mismatch

**Solution**:

```powershell
# Update lock file
terraform init -upgrade

# Or force recalculate
rm .terraform.lock.hcl
terraform init
```

### Issue: "Resource already exists"

**Cause**: Resource created outside Terraform or imported incorrectly

**Solution**:

```powershell
# Import existing resource
terraform import module.network.aws_vpc.main vpc-0123456789abcdef

# Verify import
terraform plan  # Should show 0 changes
```

---

## Directory Structure Reference

```
terraform/
├── main.tf                      # Root module - orchestrates all modules
├── variables.tf                 # Global input variables
├── outputs.tf                   # Global outputs
├── terraform.tfvars             # Variable values (gitignored)
├── .terraform.lock.hcl          # Provider version lock
│
├── moved_blocks/                # Migration logic
│   ├── moved_blocks.tf          # Resource migrations (569 lines)
│   └── moved_blocks_iam.tf      # IAM migrations (100 lines)
│
├── modules/                     # Reusable modules
│   ├── network/
│   │   ├── main.tf              # VPC, subnets, routing
│   │   ├── alb.tf               # Load balancer
│   │   ├── route53.tf           # DNS, SSL
│   │   ├── variables.tf         # Module inputs
│   │   └── outputs.tf           # Module outputs
│   │
│   ├── storage/
│   │   ├── main.tf              # Aggregator
│   │   ├── s3.tf                # S3 buckets
│   │   ├── rds.tf               # PostgreSQL
│   │   ├── secrets.tf           # Secrets Manager
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── security/
│   │   ├── iam.tf               # AWS service IAM
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── compute/
│   │   ├── ecr.tf               # Container registry
│   │   ├── ecs-fargate.tf       # Fargate services
│   │   ├── ecs-gpu.tf           # GPU EC2 cluster
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   ├── pipeline/
│   │   ├── main.tf              # Aggregator
│   │   ├── sqs.tf               # Message queue
│   │   ├── lambda.tf            # Trigger function
│   │   ├── batch.tf             # CPU batch
│   │   ├── batch-video-analysis-gpu.tf  # GPU batch
│   │   ├── variables.tf
│   │   └── outputs.tf
│   │
│   └── iam/
│       ├── iam.tf               # User accounts
│       ├── variables.tf
│       └── outputs.tf
│
└── old_version/                 # Original monolithic structure (reference)
    ├── main.tf.old
    ├── vpc.tf
    ├── s3.tf
    ├── rds.tf
    ├── iam.tf
    └── ... (14 files)
```

---

## Resources

- [Terraform Documentation](https://developer.hashicorp.com/terraform/docs)
- [AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Moved Block Guide](https://developer.hashicorp.com/terraform/language/modules/develop/refactoring)
- [Project Refactoring Documentation](../doc/issue/TERRAFORM_REFACTORING.md)

---

**Last Updated**: 2026-01-16  
**Terraform Version**: >= 1.0  
**AWS Provider**: ~> 5.0  
**Total Resources**: 153  
**Modules**: 6
