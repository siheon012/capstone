# RDS PostgreSQL 인스턴스
resource "aws_db_subnet_group" "main" {
  name       = "capstone-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "capstone-db-subnet-group"
  }
}

resource "aws_db_instance" "postgres" {
  identifier     = "capstone-postgres"
  engine         = "postgres"
  engine_version = "15.14"
  instance_class = "db.t4g.micro"

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type         = "gp3"
  storage_encrypted    = true

  db_name  = "capstone_db"
  username = "capstone_user"
  password = random_password.db_password.result

  vpc_security_group_ids = [var.rds_security_group_id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"

  skip_final_snapshot = true
  deletion_protection = false

  tags = {
    Name        = "capstone-postgres"
    Environment = "development"
  }
}