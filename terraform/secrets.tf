# Secrets Manager - DB Password
resource "aws_secretsmanager_secret" "db_password" {
  name        = "capstone/db-password"
  description = "PostgreSQL database password"

  tags = {
    Name = "capstone-db-password"
  }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

# Secrets Manager - Django Secret Key
resource "aws_secretsmanager_secret" "django_secret" {
  name        = "capstone/django-secret-key"
  description = "Django secret key"

  tags = {
    Name = "capstone-django-secret"
  }
}

resource "aws_secretsmanager_secret_version" "django_secret" {
  secret_id     = aws_secretsmanager_secret.django_secret.id
  secret_string = random_password.django_secret.result
}

# Random password generation
resource "random_password" "db_password" {
  length  = 32
  special = true
}

resource "random_password" "django_secret" {
  length  = 50
  special = true
}

# IAM Policy for ECS to access Secrets Manager
resource "aws_iam_role_policy" "ecs_secrets_policy" {
  name = "ecs-secrets-policy"
  role = aws_iam_role.ecs_task_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.db_password.arn,
          aws_secretsmanager_secret.django_secret.arn
        ]
      }
    ]
  })
}

# Outputs
output "db_password_secret_arn" {
  description = "DB Password Secret ARN"
  value       = aws_secretsmanager_secret.db_password.arn
  sensitive   = true
}

output "django_secret_arn" {
  description = "Django Secret Key ARN"
  value       = aws_secretsmanager_secret.django_secret.arn
  sensitive   = true
}