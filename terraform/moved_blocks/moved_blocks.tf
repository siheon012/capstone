# Batch launch template (gpu_batch)
moved {
  from = aws_launch_template.gpu_batch
  to   = module.pipeline.aws_launch_template.gpu_batch
}

# Network Module Moves
moved {
  from = aws_vpc.main
  to   = module.network.aws_vpc.main
}
moved {
  from = aws_subnet.public_1
  to   = module.network.aws_subnet.public_1
}
moved {
  from = aws_subnet.public_2
  to   = module.network.aws_subnet.public_2
}
moved {
  from = aws_subnet.private_1
  to   = module.network.aws_subnet.private_1
}
moved {
  from = aws_subnet.private_2
  to   = module.network.aws_subnet.private_2
}
moved {
  from = aws_internet_gateway.main
  to   = module.network.aws_internet_gateway.main
}
moved {
  from = aws_eip.nat
  to   = module.network.aws_eip.nat
}
moved {
  from = aws_nat_gateway.main
  to   = module.network.aws_nat_gateway.main
}
moved {
  from = aws_route_table.public
  to   = module.network.aws_route_table.public
}
moved {
  from = aws_route_table.private
  to   = module.network.aws_route_table.private
}
moved {
  from = aws_route_table_association.public_1
  to   = module.network.aws_route_table_association.public_1
}
moved {
  from = aws_route_table_association.public_2
  to   = module.network.aws_route_table_association.public_2
}
moved {
  from = aws_route_table_association.private_1
  to   = module.network.aws_route_table_association.private_1
}
moved {
  from = aws_route_table_association.private_2
  to   = module.network.aws_route_table_association.private_2
}
moved {
  from = aws_security_group.alb
  to   = module.network.aws_security_group.alb
}
moved {
  from = aws_security_group.ecs_tasks
  to   = module.network.aws_security_group.ecs_tasks
}
moved {
  from = aws_security_group.batch_compute
  to   = module.network.aws_security_group.batch_compute
}
moved {
  from = aws_security_group.rds
  to   = module.network.aws_security_group.rds
}
moved {
  from = aws_security_group.vpc_endpoints
  to   = module.network.aws_security_group.vpc_endpoints
}
moved {
  from = aws_lb.main
  to   = module.network.aws_lb.main
}
moved {
  from = aws_lb_target_group.frontend
  to   = module.network.aws_lb_target_group.frontend
}
moved {
  from = aws_lb_target_group.backend
  to   = module.network.aws_lb_target_group.backend
}
moved {
  from = aws_lb_listener.http
  to   = module.network.aws_lb_listener.http
}
moved {
  from = aws_lb_listener_rule.backend
  to   = module.network.aws_lb_listener_rule.backend
}
moved {
  from = aws_vpc_endpoint.s3
  to   = module.network.aws_vpc_endpoint.s3
}
moved {
  from = aws_vpc_endpoint.ecr_api
  to   = module.network.aws_vpc_endpoint.ecr_api
}
moved {
  from = aws_vpc_endpoint.ecr_dkr
  to   = module.network.aws_vpc_endpoint.ecr_dkr
}
moved {
  from = aws_vpc_endpoint.logs
  to   = module.network.aws_vpc_endpoint.logs
}
moved {
  from = aws_acm_certificate_validation.main[0]
  to   = module.network.aws_acm_certificate_validation.main[0]
}
moved {
  from = aws_route53_record.cert_validation["deepsentinel.cloud"]
  to   = module.network.aws_route53_record.cert_validation["deepsentinel.cloud"]
}
moved {
  from = aws_route53_record.cert_validation["*.deepsentinel.cloud"]
  to   = module.network.aws_route53_record.cert_validation["*.deepsentinel.cloud"]
}
moved {
  from = aws_route53_zone.main[0]
  to   = module.network.aws_route53_zone.main[0]
}
moved {
  from = aws_route53_record.frontend[0]
  to   = module.network.aws_route53_record.frontend[0]
}
moved {
  from = aws_route53_record.www[0]
  to   = module.network.aws_route53_record.www[0]
}
moved {
  from = aws_route53_record.api[0]
  to   = module.network.aws_route53_record.api[0]
}
moved {
  from = aws_acm_certificate.main[0]
  to   = module.network.aws_acm_certificate.main[0]
}
# aws_route53_record.cert_validation은 for_each 사용하므로 재생성됨 (DNS 검증 레코드)
moved {
  from = aws_acm_certificate_validation.main[0]
  to   = module.network.aws_acm_certificate_validation.main[0]
}
moved {
  from = aws_lb_listener.https[0]
  to   = module.network.aws_lb_listener.https[0]
}
moved {
  from = aws_lb_listener_rule.backend_https[0]
  to   = module.network.aws_lb_listener_rule.backend_https[0]
}

# Storage Module Moves
moved {
  from = aws_db_subnet_group.main
  to   = module.storage.aws_db_subnet_group.main
}
moved {
  from = aws_db_instance.postgres
  to   = module.storage.aws_db_instance.postgres
}
moved {
  from = aws_s3_bucket.raw_videos
  to   = module.storage.aws_s3_bucket.raw_videos
}
moved {
  from = aws_s3_bucket.thumbnails
  to   = module.storage.aws_s3_bucket.thumbnails
}
moved {
  from = aws_s3_bucket.highlights
  to   = module.storage.aws_s3_bucket.highlights
}
moved {
  from = aws_s3_bucket.terraform_state
  to   = module.storage.aws_s3_bucket.terraform_state
}
moved {
  from = aws_s3_bucket_versioning.raw_videos
  to   = module.storage.aws_s3_bucket_versioning.raw_videos
}
moved {
  from = aws_s3_bucket_versioning.thumbnails
  to   = module.storage.aws_s3_bucket_versioning.thumbnails
}
moved {
  from = aws_s3_bucket_versioning.highlights
  to   = module.storage.aws_s3_bucket_versioning.highlights
}
moved {
  from = aws_s3_bucket_versioning.terraform_state
  to   = module.storage.aws_s3_bucket_versioning.terraform_state
}
moved {
  from = aws_s3_bucket_server_side_encryption_configuration.raw_videos
  to   = module.storage.aws_s3_bucket_server_side_encryption_configuration.raw_videos
}
moved {
  from = aws_s3_bucket_server_side_encryption_configuration.thumbnails
  to   = module.storage.aws_s3_bucket_server_side_encryption_configuration.thumbnails
}
moved {
  from = aws_s3_bucket_server_side_encryption_configuration.highlights
  to   = module.storage.aws_s3_bucket_server_side_encryption_configuration.highlights
}
moved {
  from = aws_s3_bucket_server_side_encryption_configuration.terraform_state
  to   = module.storage.aws_s3_bucket_server_side_encryption_configuration.terraform_state
}
moved {
  from = aws_s3_bucket_public_access_block.raw_videos
  to   = module.storage.aws_s3_bucket_public_access_block.raw_videos
}
moved {
  from = aws_s3_bucket_public_access_block.thumbnails
  to   = module.storage.aws_s3_bucket_public_access_block.thumbnails
}
moved {
  from = aws_s3_bucket_public_access_block.highlights
  to   = module.storage.aws_s3_bucket_public_access_block.highlights
}
moved {
  from = aws_s3_bucket_public_access_block.terraform_state
  to   = module.storage.aws_s3_bucket_public_access_block.terraform_state
}
moved {
  from = aws_s3_bucket_policy.raw_videos
  to   = module.storage.aws_s3_bucket_policy.raw_videos
}
moved {
  from = aws_s3_bucket_policy.thumbnails
  to   = module.storage.aws_s3_bucket_policy.thumbnails
}
moved {
  from = aws_s3_bucket_cors_configuration.raw_videos
  to   = module.storage.aws_s3_bucket_cors_configuration.raw_videos
}
moved {
  from = aws_s3_bucket_cors_configuration.thumbnails
  to   = module.storage.aws_s3_bucket_cors_configuration.thumbnails
}
moved {
  from = aws_s3_bucket_cors_configuration.highlights
  to   = module.storage.aws_s3_bucket_cors_configuration.highlights
}
moved {
  from = aws_secretsmanager_secret.db_password
  to   = module.storage.aws_secretsmanager_secret.db_password
}
moved {
  from = aws_secretsmanager_secret.django_secret
  to   = module.storage.aws_secretsmanager_secret.django_secret
}
moved {
  from = aws_secretsmanager_secret_version.db_password
  to   = module.storage.aws_secretsmanager_secret_version.db_password
}
moved {
  from = aws_secretsmanager_secret_version.django_secret
  to   = module.storage.aws_secretsmanager_secret_version.django_secret
}
moved {
  from = random_password.db_password
  to   = module.storage.random_password.db_password
}
moved {
  from = random_password.django_secret
  to   = module.storage.random_password.django_secret
}

# Compute Module Moves
moved {
  from = aws_ecr_repository.frontend
  to   = module.compute.aws_ecr_repository.frontend
}
moved {
  from = aws_ecr_repository.backend
  to   = module.compute.aws_ecr_repository.backend
}
# batch_processor ECR은 pipeline 모듈로 이동
moved {
  from = aws_ecr_lifecycle_policy.ai_batch
  to   = module.pipeline.aws_ecr_lifecycle_policy.ai_batch
}
moved {
  from = aws_ecs_cluster.main
  to   = module.compute.aws_ecs_cluster.main
}
# ECS IAM roles는 moved_blocks_iam.tf에서 module.security로 이동 선언됨
moved {
  from = aws_cloudwatch_log_group.frontend
  to   = module.compute.aws_cloudwatch_log_group.frontend
}
moved {
  from = aws_cloudwatch_log_group.backend
  to   = module.compute.aws_cloudwatch_log_group.backend
}
moved {
  from = aws_ecs_task_definition.frontend
  to   = module.compute.aws_ecs_task_definition.frontend
}
moved {
  from = aws_ecs_task_definition.backend
  to   = module.compute.aws_ecs_task_definition.backend
}
moved {
  from = aws_ecs_service.frontend
  to   = module.compute.aws_ecs_service.frontend
}
moved {
  from = aws_ecs_service.backend
  to   = module.compute.aws_ecs_service.backend
}
moved {
  from = aws_appautoscaling_target.frontend
  to   = module.compute.aws_appautoscaling_target.frontend
}
moved {
  from = aws_appautoscaling_policy.frontend_cpu
  to   = module.compute.aws_appautoscaling_policy.frontend_cpu
}
moved {
  from = aws_appautoscaling_target.backend
  to   = module.compute.aws_appautoscaling_target.backend
}
moved {
  from = aws_appautoscaling_policy.backend_cpu
  to   = module.compute.aws_appautoscaling_policy.backend_cpu
}
moved {
  from = data.aws_ami.ecs_gpu
  to   = module.compute.data.aws_ami.ecs_gpu
}
moved {
  from = aws_launch_template.gpu_ecs
  to   = module.compute.aws_launch_template.gpu_ecs
}
moved {
  from = aws_autoscaling_group.gpu_ecs
  to   = module.compute.aws_autoscaling_group.gpu_ecs
}
moved {
  from = aws_ecs_capacity_provider.gpu
  to   = module.compute.aws_ecs_capacity_provider.gpu
}
moved {
  from = aws_ecs_cluster_capacity_providers.main
  to   = module.compute.aws_ecs_cluster_capacity_providers.main
}
moved {
  from = aws_ecs_task_definition.video_analysis_gpu
  to   = module.compute.aws_ecs_task_definition.video_analysis_gpu
}
# video_analysis_gpu cloudwatch log는 pipeline 모듈로 이동 (아래 Pipeline 섹션 참조)
moved {
  from = aws_ecs_service.video_analysis_gpu
  to   = module.compute.aws_ecs_service.video_analysis_gpu
}
moved {
  from = aws_service_discovery_private_dns_namespace.internal
  to   = module.compute.aws_service_discovery_private_dns_namespace.internal
}
moved {
  from = aws_service_discovery_service.video_analysis_gpu
  to   = module.compute.aws_service_discovery_service.video_analysis_gpu
}
moved {
  from = data.aws_ecs_cluster.main
  to   = module.compute.data.aws_ecs_cluster.main
}
# launch_template.batch_gpu는 pipeline 모듈로 이동 (아래 Pipeline 섹션 참조)
# Batch IAM resources는 moved_blocks_iam.tf에서 module.security로 이동 선언됨
# Batch compute resources는 pipeline 모듈로 이동 (이미 아래 Pipeline Module Moves 섹션에서 처리)

# Pipeline Module Moves
moved {
  from = aws_batch_compute_environment.video_analysis_gpu
  to   = module.pipeline.aws_batch_compute_environment.video_analysis_gpu
}
moved {
  from = aws_batch_job_queue.video_analysis_gpu
  to   = module.pipeline.aws_batch_job_queue.video_analysis_gpu
}
moved {
  from = aws_batch_job_definition.video_analysis_processor
  to   = module.pipeline.aws_batch_job_definition.video_analysis_processor
}
moved {
  from = aws_batch_job_definition.gpu_video_processor
  to   = module.pipeline.aws_batch_job_definition.gpu_video_processor
}
moved {
  from = aws_cloudwatch_log_group.batch_video_analysis_processor
  to   = module.pipeline.aws_cloudwatch_log_group.batch_video_analysis_processor
}
moved {
  from = aws_cloudwatch_log_group.batch_video_processor
  to   = module.pipeline.aws_cloudwatch_log_group.batch_video_processor
}
moved {
  from = aws_cloudwatch_log_group.video_analysis_gpu
  to   = module.compute.aws_cloudwatch_log_group.video_analysis_gpu
}
moved {
  from = aws_launch_template.batch_gpu
  to   = module.pipeline.aws_launch_template.batch_gpu
}
moved {
  from = data.aws_ecr_repository.ai_batch
  to   = module.pipeline.data.aws_ecr_repository.ai_batch
}
moved {
  from = aws_ecr_repository.batch_processor
  to   = module.pipeline.aws_ecr_repository.batch_processor
}

moved {
  from = aws_sqs_queue.video_processing_dlq
  to   = module.pipeline.aws_sqs_queue.video_processing_dlq
}
moved {
  from = aws_sqs_queue.video_processing
  to   = module.pipeline.aws_sqs_queue.video_processing
}
moved {
  from = aws_sqs_queue_policy.video_processing
  to   = module.pipeline.aws_sqs_queue_policy.video_processing
}
moved {
  from = aws_s3_bucket_notification.video_upload
  to   = module.pipeline.aws_s3_bucket_notification.video_upload
}
# Lambda IAM resources는 moved_blocks_iam.tf에서 module.security로 이동 선언됨
moved {
  from = aws_lambda_function.sqs_to_batch
  to   = module.pipeline.aws_lambda_function.sqs_to_batch
}
moved {
  from = aws_lambda_event_source_mapping.sqs_to_batch
  to   = module.pipeline.aws_lambda_event_source_mapping.sqs_to_batch
}
moved {
  from = aws_cloudwatch_log_group.sqs_to_batch_lambda
  to   = module.pipeline.aws_cloudwatch_log_group.sqs_to_batch_lambda
}
moved {
  from = aws_cloudwatch_metric_alarm.queue_depth
  to   = module.pipeline.aws_cloudwatch_metric_alarm.queue_depth
}
moved {
  from = aws_cloudwatch_metric_alarm.dlq_messages
  to   = module.pipeline.aws_cloudwatch_metric_alarm.dlq_messages
}

# IAM Module Moves
moved {
  from = aws_iam_group.admins
  to   = module.iam.aws_iam_group.admins
}
moved {
  from = aws_iam_group.developers
  to   = module.iam.aws_iam_group.developers
}
moved {
  from = aws_iam_group_membership.admins
  to   = module.iam.aws_iam_group_membership.admins
}
moved {
  from = aws_iam_group_membership.developers
  to   = module.iam.aws_iam_group_membership.developers
}
moved {
  from = aws_iam_group_policy_attachment.admins_policy
  to   = module.iam.aws_iam_group_policy_attachment.admins_policy
}
moved {
  from = aws_iam_group_policy_attachment.developers_policy
  to   = module.iam.aws_iam_group_policy_attachment.developers_policy
}
moved {
  from = aws_iam_group_policy_attachment.developers_s3_policy
  to   = module.iam.aws_iam_group_policy_attachment.developers_s3_policy
}
moved {
  from = aws_iam_user.siheon_admin
  to   = module.iam.aws_iam_user.siheon_admin
}
moved {
  from = aws_iam_user.seungbeom_dev
  to   = module.iam.aws_iam_user.seungbeom_dev
}
moved {
  from = aws_iam_user.doyeon_dev
  to   = module.iam.aws_iam_user.doyeon_dev
}
moved {
  from = aws_iam_user.github_actions
  to   = module.iam.aws_iam_user.github_actions
}
moved {
  from = aws_iam_policy.github_actions_ecs_deploy
  to   = module.iam.aws_iam_policy.github_actions_ecs_deploy
}
moved {
  from = aws_iam_policy.developers_s3_access
  to   = module.iam.aws_iam_policy.developers_s3_access
}
moved {
  from = aws_iam_user_policy_attachment.github_actions_ecr
  to   = module.iam.aws_iam_user_policy_attachment.github_actions_ecr
}
moved {
  from = aws_iam_user_policy_attachment.github_actions_ecs_deploy
  to   = module.iam.aws_iam_user_policy_attachment.github_actions_ecs_deploy
}
moved {
  from = aws_iam_user_policy_attachment.siheon_admin_billing
  to   = module.iam.aws_iam_user_policy_attachment.siheon_admin_billing
}
moved {
  from = aws_iam_user_policy_attachment.siheon_admin_cost_budget
  to   = module.iam.aws_iam_user_policy_attachment.siheon_admin_cost_budget
}
moved {
  from = aws_iam_user_policy_attachment.siheon_admin_monitoring
  to   = module.iam.aws_iam_user_policy_attachment.siheon_admin_monitoring
}
moved {
  from = aws_iam_policy.siheon_admin_monitoring
  to   = module.iam.aws_iam_policy.siheon_admin_monitoring
}
moved {
  from = aws_iam_user_group_membership.siheon_admin
  to   = module.iam.aws_iam_user_group_membership.siheon_admin
}
moved {
  from = aws_iam_user_group_membership.seungbeom_dev
  to   = module.iam.aws_iam_user_group_membership.seungbeom_dev
}
moved {
  from = aws_iam_user_group_membership.doyeon_dev
  to   = module.iam.aws_iam_user_group_membership.doyeon_dev
}
moved {
  from = aws_iam_user_policy.github_actions_ecr
  to   = module.iam.aws_iam_user_policy.github_actions_ecr
}
moved {
  from = aws_iam_user_policy.github_actions_ecs
  to   = module.iam.aws_iam_user_policy.github_actions_ecs
}
moved {
  from = aws_iam_user_policy.github_actions_s3
  to   = module.iam.aws_iam_user_policy.github_actions_s3
}
