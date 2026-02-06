# IAM 그룹들
resource "aws_iam_group" "admins" {
  name = "capstone-admins"
}

resource "aws_iam_group" "developers" {
  name = "capstone-developers"
}

# IAM 그룹 정책 연결
resource "aws_iam_group_policy_attachment" "admins_policy" {
  group      = aws_iam_group.admins.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

resource "aws_iam_group_policy_attachment" "developers_policy" {
  group      = aws_iam_group.developers.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

# IAM 사용자들
resource "aws_iam_user" "siheon_admin" {
  name = "siheon-admin"
}

resource "aws_iam_user" "seungbeom_dev" {
  name = "seungbeom-dev"
}

resource "aws_iam_user" "doyeon_dev" {
  name = "doyeon-dev"
}

resource "aws_iam_user" "github_actions" {
  name = "capstone-github-actions"
}

# IAM 사용자-그룹 연결
resource "aws_iam_group_membership" "admins" {
  name  = "capstone-admins-membership"
  group = aws_iam_group.admins.name
  users = [
    aws_iam_user.siheon_admin.name
  ]
}

resource "aws_iam_group_membership" "developers" {
  name  = "capstone-developers-membership"
  group = aws_iam_group.developers.name
  users = [
    aws_iam_user.seungbeom_dev.name,
    aws_iam_user.doyeon_dev.name
  ]
}

# GitHub Actions 사용자 ECR 권한
resource "aws_iam_user_policy_attachment" "github_actions_ecr" {
  user       = aws_iam_user.github_actions.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser"
}

# GitHub Actions 사용자 ECS 배포 권한
resource "aws_iam_policy" "github_actions_ecs_deploy" {
  name        = "GitHubActionsECSDeploy"
  description = "GitHub Actions를 위한 ECS 배포 권한"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition",
          "ecs:DescribeTasks",
          "ecs:ListTasks",
          "ecs:RegisterTaskDefinition",
          "ecs:DeregisterTaskDefinition"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = [
          aws_iam_role.ecs_task_execution_role.arn,
          aws_iam_role.ecs_task_role.arn
        ]
      }
    ]
  })
}

resource "aws_iam_user_policy_attachment" "github_actions_ecs_deploy" {
  user       = aws_iam_user.github_actions.name
  policy_arn = aws_iam_policy.github_actions_ecs_deploy.arn
}

# siheon-admin 사용자 추가 권한들
resource "aws_iam_user_policy_attachment" "siheon_admin_billing" {
  user       = aws_iam_user.siheon_admin.name
  policy_arn = "arn:aws:iam::aws:policy/job-function/Billing"
}

# 올바른 결제 관련 정책들로 수정
resource "aws_iam_user_policy_attachment" "siheon_admin_cost_budget" {
  user       = aws_iam_user.siheon_admin.name
  policy_arn = "arn:aws:iam::aws:policy/AWSBillingReadOnlyAccess"
}

# siheon-admin을 위한 커스텀 정책 (상세한 비용 및 사용량 모니터링)
resource "aws_iam_policy" "siheon_admin_monitoring" {
  name        = "CapstoneAdminMonitoring"
  description = "Capstone 프로젝트 관리자를 위한 모니터링 및 관리 권한"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          # 비용 및 결제 모니터링
          "ce:*",
          "budgets:*",
          "aws-portal:*",
          "account:*",
          "billing:*",
          "payments:*",
          "tax:*",
          "cur:*",

          # CloudWatch 모니터링
          "cloudwatch:*",
          "logs:*",

          # 리소스 사용량 모니터링
          "support:*",
          "trustedadvisor:*",

          # 태그 관리
          "tag:*",
          "resource-groups:*",

          # 설정 관리
          "config:*",

          # 보안 모니터링
          "cloudtrail:*",
          "inspector:*",
          "guardduty:*",

          # 인벤토리 관리
          "ssm:ListInstances",
          "ssm:DescribeInstanceInformation",
          "ec2:DescribeInstances",
          "rds:DescribeDBInstances",
          "s3:ListAllMyBuckets"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_user_policy_attachment" "siheon_admin_monitoring" {
  user       = aws_iam_user.siheon_admin.name
  policy_arn = aws_iam_policy.siheon_admin_monitoring.arn
}

# 개발자 그룹을 위한 S3 접근 정책
resource "aws_iam_policy" "developers_s3_access" {
  name        = "CapstoneDevelopersS3Access"
  description = "Capstone 개발자를 위한 S3 버킷 접근 권한"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation",
          "s3:GetBucketVersioning"
        ]
        Resource = [
          aws_s3_bucket.raw_videos.arn,
          aws_s3_bucket.thumbnails.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:GetObjectVersion",
          "s3:GetObjectVersionAcl"
        ]
        Resource = [
          "${aws_s3_bucket.raw_videos.arn}/*",
          "${aws_s3_bucket.thumbnails.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListAllMyBuckets",
          "s3:GetBucketLocation"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name = "capstone-developers-s3-policy"
  }
}

resource "aws_iam_group_policy_attachment" "developers_s3_policy" {
  group      = aws_iam_group.developers.name
  policy_arn = aws_iam_policy.developers_s3_access.arn
}