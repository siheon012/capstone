# ==========================================
# Security Module IAM Moved Blocks
# ==========================================

# ECS IAM Roles (from compute to security)
moved {
  from = aws_iam_role.ecs_task_execution_role
  to   = module.security.aws_iam_role.ecs_task_execution_role
}
moved {
  from = aws_iam_role_policy_attachment.ecs_task_execution_role_policy
  to   = module.security.aws_iam_role_policy_attachment.ecs_task_execution_role_policy
}
moved {
  from = aws_iam_role.ecs_task_role
  to   = module.security.aws_iam_role.ecs_task_role
}
moved {
  from = aws_iam_role_policy.ecs_task_s3_policy
  to   = module.security.aws_iam_role_policy.ecs_task_s3_policy
}
moved {
  from = aws_iam_role_policy.ecs_task_bedrock_policy
  to   = module.security.aws_iam_role_policy.ecs_task_bedrock_policy
}
moved {
  from = aws_iam_role_policy.ecs_task_sqs_policy
  to   = module.security.aws_iam_role_policy.ecs_task_sqs_policy
}
moved {
  from = aws_iam_role_policy.ecs_secrets_policy
  to   = module.security.aws_iam_role_policy.ecs_secrets_policy
}

# Batch IAM Roles (from pipeline to security)
moved {
  from = aws_iam_role.batch_service_role
  to   = module.security.aws_iam_role.batch_service_role
}
moved {
  from = aws_iam_role_policy_attachment.batch_service_role
  to   = module.security.aws_iam_role_policy_attachment.batch_service_role
}
moved {
  from = aws_iam_role.batch_execution_role
  to   = module.security.aws_iam_role.batch_execution_role
}
moved {
  from = aws_iam_role_policy_attachment.batch_execution_role
  to   = module.security.aws_iam_role_policy_attachment.batch_execution_role
}
moved {
  from = aws_iam_role_policy.batch_execution_secrets
  to   = module.security.aws_iam_role_policy.batch_execution_secrets
}
moved {
  from = aws_iam_role.batch_task_role
  to   = module.security.aws_iam_role.batch_task_role
}
moved {
  from = aws_iam_role_policy.batch_task_policy
  to   = module.security.aws_iam_role_policy.batch_task_policy
}
moved {
  from = aws_iam_role.batch_instance_role
  to   = module.security.aws_iam_role.batch_instance_role
}
moved {
  from = aws_iam_role_policy_attachment.batch_instance_ecs
  to   = module.security.aws_iam_role_policy_attachment.batch_instance_ecs
}
moved {
  from = aws_iam_instance_profile.batch_instance
  to   = module.security.aws_iam_instance_profile.batch_instance
}
moved {
  from = aws_iam_role.ecs_instance_role
  to   = module.security.aws_iam_role.ecs_instance_role
}
moved {
  from = aws_iam_role_policy_attachment.ecs_instance_role
  to   = module.security.aws_iam_role_policy_attachment.ecs_instance_role
}
moved {
  from = aws_iam_instance_profile.ecs_instance
  to   = module.security.aws_iam_instance_profile.ecs_instance
}

# Lambda IAM Role (from pipeline to security)
moved {
  from = aws_iam_role.sqs_to_batch_lambda
  to   = module.security.aws_iam_role.lambda_sqs_to_batch
}
moved {
  from = aws_iam_role_policy.sqs_to_batch_lambda
  to   = module.security.aws_iam_role_policy.lambda_sqs_batch_policy
}
