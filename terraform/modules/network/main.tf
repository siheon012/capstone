# VPC 및 네트워킹
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "capstone-vpc"
  }
}

# Public 서브넷
resource "aws_subnet" "public_1" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.region}a"
  map_public_ip_on_launch = true

  tags = {
    Name = "capstone-public-subnet-1"
  }
}

resource "aws_subnet" "public_2" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = "${var.region}c"
  map_public_ip_on_launch = true

  tags = {
    Name = "capstone-public-subnet-2"
  }
}

# Private 서브넷 (RDS용)
resource "aws_subnet" "private_1" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "${var.region}a"

  tags = {
    Name = "capstone-private-subnet-1"
  }
}

resource "aws_subnet" "private_2" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = "${var.region}c"

  tags = {
    Name = "capstone-private-subnet-2"
  }
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "capstone-igw"
  }
}

# ❌ NAT Gateway 제거: 비용 절감 ($0.059/시간 × 752시간 = $44/월)
# 모든 리소스가 Public Subnet에서 실행되므로 NAT Gateway 불필요
# - ECS Fargate: Public Subnet + assign_public_ip = true
# - AWS Batch: Public Subnet 사용
# - Security Group으로 인바운드 차단하므로 보안 문제 없음

# resource "aws_eip" "nat" {
#   domain = "vpc"
#
#   tags = {
#     Name = "capstone-nat-eip"
#   }
# }

# resource "aws_nat_gateway" "main" {
#   allocation_id = aws_eip.nat.id
#   subnet_id     = aws_subnet.public_1.id
#
#   tags = {
#     Name = "capstone-nat-gw"
#   }
#
#   depends_on = [aws_internet_gateway.main]
# }

# Public 라우트 테이블
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "capstone-public-rt"
  }
}

# Private 라우트 테이블
# NAT Gateway 제거로 인터넷 라우팅 불필요 (RDS만 Private Subnet 사용)
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  # route 제거: Private Subnet은 RDS 전용, 인터넷 접근 불필요
  # RDS는 VPC 내부 통신만 사용

  tags = {
    Name = "capstone-private-rt"
  }
}

# 라우트 테이블 연결
resource "aws_route_table_association" "public_1" {
  subnet_id      = aws_subnet.public_1.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_2" {
  subnet_id      = aws_subnet.public_2.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private_1" {
  subnet_id      = aws_subnet.private_1.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_2" {
  subnet_id      = aws_subnet.private_2.id
  route_table_id = aws_route_table.private.id
}

# Security Group - ALB
resource "aws_security_group" "alb" {
  name        = "capstone-alb-sg"
  description = "Security group for Application Load Balancer"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "capstone-alb-sg"
  }
}

# Security Group - ECS Tasks
# ✅ Public Subnet에 있어도 안전: ALB에서만 인바운드 허용
resource "aws_security_group" "ecs_tasks" {
  name        = "capstone-ecs-tasks-sg"
  description = "Security group for ECS tasks"
  vpc_id      = aws_vpc.main.id

  # 인바운드: ALB에서 오는 트래픽만 허용 (외부 직접 접근 차단)
  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "Allow inbound from ALB to Frontend"
  }

  ingress {
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "Allow inbound from ALB to Backend"
  }

  # 아웃바운드: 전체 허용 (ECR 이미지 pull, 외부 API 호출용)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound for ECR, RDS, S3, etc."
  }

  tags = {
    Name = "capstone-ecs-tasks-sg"
  }
}

# Security Group - Batch Compute
# ✅ Public Subnet에 있어도 안전: 인바운드 규칙 없음 (외부 접근 완전 차단)
resource "aws_security_group" "batch_compute" {
  name        = "capstone-dev-batch-compute-sg"
  description = "Security group for AWS Batch compute environment"
  vpc_id      = aws_vpc.main.id

  # 인바운드 규칙 없음: 외부에서 접근 불가능
  # Batch Job은 아웃바운드만 사용 (S3, RDS, Bedrock 접근)

  # 아웃바운드: 전체 허용 (S3, RDS, Bedrock, ECR 접근용)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound for S3, RDS, Bedrock, ECR"
  }

  tags = {
    Name = "capstone-batch-compute-sg"
  }
}

# Security Group - RDS
resource "aws_security_group" "rds" {
  name        = "capstone-rds-sg"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = aws_vpc.main.id

  # ECS Tasks에서 접근 허용
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  # AWS Batch Compute에서 접근 허용
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.batch_compute.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "capstone-rds-sg"
  }
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "capstone-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [aws_subnet.public_1.id, aws_subnet.public_2.id]

  enable_deletion_protection = false

  tags = {
    Name = "capstone-alb"
  }
}

# Target Group - Frontend
resource "aws_lb_target_group" "frontend" {
  name        = "capstone-frontend-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    path                = "/"
    interval            = 30
    matcher             = "200"
  }

  tags = {
    Name = "capstone-frontend-tg"
  }
}

# Target Group - Backend
resource "aws_lb_target_group" "backend" {
  name        = "capstone-backend-tg"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    path                = "/api/health/"
    interval            = 30
    matcher             = "200"
  }

  tags = {
    Name = "capstone-backend-tg"
  }
}

# ALB Listener - HTTP (Redirect to HTTPS)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# Note: HTTPS Listener는 route53.tf에 정의되어 있음

# ALB Listener Rule - Backend (Path-based routing)
resource "aws_lb_listener_rule" "backend" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    path_pattern {
      values = ["/api/*", "/admin/*", "/db/*"]
    }
  }
}

# Outputs는 outputs.tf에 정의됨

# ========================================
# VPC Endpoints (비용 최적화)
# ========================================

# S3 Gateway Endpoint (무료) - S3 트래픽 최적화
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.region}.s3"

  route_table_ids = [
    aws_route_table.public.id,
    aws_route_table.private.id
  ]

  tags = {
    Name = "capstone-s3-endpoint"
  }
}

# ❌ Interface Endpoints 제거: Public Subnet 사용으로 불필요
# 모든 리소스가 Public Subnet + Internet Gateway 사용
# → ECR, CloudWatch Logs에 무료로 접근 가능
# 
# 제거된 Endpoints (월 $29.34 절감):
# - ECR API Endpoint ($0.013/hr × 752hr = $9.78)
# - ECR DKR Endpoint ($0.013/hr × 752hr = $9.78)
# - CloudWatch Logs Endpoint ($0.013/hr × 752hr = $9.78)
#
# 이전 코드 (주석 처리):
# resource "aws_vpc_endpoint" "ecr_api" {
#   vpc_id              = aws_vpc.main.id
#   service_name        = "com.amazonaws.${var.region}.ecr.api"
#   vpc_endpoint_type   = "Interface"
#   ...
# }
# resource "aws_vpc_endpoint" "ecr_dkr" { ... }
# resource "aws_vpc_endpoint" "logs" { ... }
# resource "aws_security_group" "vpc_endpoints" { ... }