# ========================================
# Route 53 DNS Configuration
# ========================================

# Route 53 Hosted Zone (도메인이 있는 경우)
# 주의: 도메인을 먼저 구매해야 합니다 (예: example.com)
resource "aws_route53_zone" "main" {
  count = var.domain_name != "" ? 1 : 0
  name  = var.domain_name # 예: "capstone-project.com"

  tags = {
    Name        = "capstone-hosted-zone"
    Environment = var.environment
    Project     = "Unmanned"
  }
}

# ALIAS Record - ALB를 가리킴 (Frontend용)
resource "aws_route53_record" "frontend" {
  count   = var.domain_name != "" ? 1 : 0
  zone_id = aws_route53_zone.main[0].zone_id
  name    = var.domain_name # 예: "deepsentinel.cloud"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# ALIAS Record - www 서브도메인
resource "aws_route53_record" "www" {
  count   = var.domain_name != "" ? 1 : 0
  zone_id = aws_route53_zone.main[0].zone_id
  name    = "www.${var.domain_name}" # 예: "www.deepsentinel.cloud"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# ALIAS Record - API 서브도메인 (옵션)
resource "aws_route53_record" "api" {
  count   = var.domain_name != "" ? 1 : 0
  zone_id = aws_route53_zone.main[0].zone_id
  name    = "api.${var.domain_name}" # 예: "api.deepsentinel.cloud"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# ========================================
# ACM Certificate (HTTPS용)
# ========================================

# SSL/TLS 인증서 (HTTPS 필요시)
resource "aws_acm_certificate" "main" {
  count             = var.domain_name != "" ? 1 : 0
  domain_name       = var.domain_name
  validation_method = "DNS"

  subject_alternative_names = [
    "*.${var.domain_name}" # 와일드카드 (예: *.deepsentinel.cloud)
  ]

  tags = {
    Name        = "capstone-ssl-certificate"
    Environment = var.environment
    Project     = "Unmanned"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# DNS 검증용 레코드
resource "aws_route53_record" "cert_validation" {
  for_each = var.domain_name != "" ? {
    for dvo in aws_acm_certificate.main[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.main[0].zone_id
}

# 인증서 검증 완료 대기
resource "aws_acm_certificate_validation" "main" {
  count                   = var.domain_name != "" ? 1 : 0
  certificate_arn         = aws_acm_certificate.main[0].arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# ALB HTTPS Listener 추가
# HTTPS 리스너 (443 포트)

resource "aws_lb_listener" "https" {
  count             = var.domain_name != "" ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = aws_acm_certificate_validation.main[0].certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

# HTTPS 리스너 규칙 - Backend (Path-based routing)
resource "aws_lb_listener_rule" "backend_https" {
  count        = var.domain_name != "" ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
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

# HTTP 리스너는 vpc.tf에 이미 존재하므로 여기서는 생성하지 않음
# 대신 기존 HTTP 리스너를 HTTPS로 리다이렉트하도록 수정
# resource "aws_lb_listener_rule" "http_to_https_redirect" {
#   count        = var.domain_name != "" ? 1 : 0
#   listener_arn = aws_lb_listener.http.arn
#   priority     = 1
#
#   action {
#     type = "redirect"
#
#     redirect {
#       port        = "443"
#       protocol    = "HTTPS"
#       status_code = "HTTP_301"
#     }
#   }
#
#   condition {
#     path_pattern {
#       values = ["/*"]
#     }
#   }
# }

# ========================================
# Outputs는 outputs.tf에 정의됨
