# ==========================================
# IAM Module Outputs
# ==========================================
# 사용자 계정/그룹 정보 (다른 모듈에서는 거의 사용하지 않음)

# ==========================================
# IAM Groups
# ==========================================

output "admins_group_name" {
  description = "Admins group name (관리자 그룹)"
  value       = aws_iam_group.admins.name
}

output "developers_group_name" {
  description = "Developers group name (개발자 그룹)"
  value       = aws_iam_group.developers.name
}

# ==========================================
# IAM Users
# ==========================================

output "github_actions_user_name" {
  description = "GitHub Actions user name (CI/CD용)"
  value       = aws_iam_user.github_actions.name
}

output "siheon_admin_user_name" {
  description = "Siheon admin user name"
  value       = aws_iam_user.siheon_admin.name
}
