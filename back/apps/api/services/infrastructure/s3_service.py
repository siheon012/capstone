"""
AWS S3 비디오 업로드 서비스
JWT 인증 및 Pre-signed URL을 통한 무상태 업로드 구현
"""

import boto3
import os
import uuid
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
import jwt
from rest_framework import status
from rest_framework.response import Response
import logging

logger = logging.getLogger(__name__)


class S3VideoUploadService:
    """
    S3 비디오 업로드를 위한 서비스 클래스
    JWT 기반 인증과 Pre-signed URL 생성을 담당
    """

    def __init__(self):
        """S3 클라이언트 및 설정 초기화"""
        # AWS_STORAGE_BUCKET_NAME 또는 AWS_S3_BUCKET_NAME 지원 (하위 호환)
        self.bucket_name = self._get_env_var(
            "AWS_STORAGE_BUCKET_NAME", None
        ) or self._get_env_var("AWS_S3_BUCKET_NAME")
        self.region = (
            self._get_env_var("AWS_S3_REGION_NAME", None)
            or self._get_env_var("AWS_S3_REGION", None)
            or self._get_env_var("AWS_DEFAULT_REGION")
        )
        self.use_localstack = (
            self._get_env_var("USE_LOCALSTACK", "false").lower() == "true"
        )

        # LocalStack 또는 실제 AWS 설정
        if self.use_localstack:
            # LocalStack 설정
            endpoint_url = self._get_env_var(
                "AWS_ENDPOINT_URL", "http://localhost:4566"
            )
            self.s3_client = boto3.client(
                "s3",
                endpoint_url=endpoint_url,
                aws_access_key_id=self._get_env_var("AWS_ACCESS_KEY_ID", "test"),
                aws_secret_access_key=self._get_env_var(
                    "AWS_SECRET_ACCESS_KEY", "test"
                ),
                region_name=self.region,
            )
            logger.info(
                f"🔧 LocalStack S3 클라이언트 초기화 완료 - endpoint: {endpoint_url}"
            )
        else:
            # 실제 AWS 환경 - IAM Role 또는 환경변수 사용
            self.s3_client = boto3.client("s3", region_name=self.region)
            logger.info("☁️ AWS S3 클라이언트 초기화 완료")

    def _get_env_var(self, var_name: str, default: Optional[str] = None) -> str:
        """환경변수 안전하게 가져오기"""
        value = os.getenv(var_name, default)
        if value is None:
            raise ImproperlyConfigured(f"환경변수 {var_name}가 설정되지 않았습니다.")
        return value

    def generate_upload_token(
        self, user_id: str, file_name: str, file_size: int
    ) -> str:
        """
        업로드 토큰 생성 (JWT)

        Args:
            user_id: 사용자 ID
            file_name: 파일명
            file_size: 파일 크기 (bytes)

        Returns:
            JWT 토큰 문자열
        """
        upload_id = str(uuid.uuid4())
        payload = {
            "user_id": user_id,
            "file_name": file_name,
            "file_size": file_size,
            "upload_id": upload_id,
            "exp": datetime.utcnow() + timedelta(hours=1),  # 1시간 유효
            "iat": datetime.utcnow(),
            "iss": "capstone-video-service",
        }

        secret_key = self._get_env_var("SECRET_KEY")
        token = jwt.encode(payload, secret_key, algorithm="HS256")

        logger.info(
            f"🎫 업로드 토큰 생성: user_id={user_id}, upload_id={payload['upload_id']}"
        )
        return token

    def validate_upload_token(self, token: str) -> Dict:
        """
        업로드 토큰 검증

        Args:
            token: JWT 토큰

        Returns:
            디코딩된 페이로드 또는 예외 발생
        """
        try:
            secret_key = self._get_env_var("SECRET_KEY")
            payload = jwt.decode(token, secret_key, algorithms=["HS256"])

            logger.info(f"✅ 토큰 검증 성공: upload_id={payload.get('upload_id')}")
            return payload

        except jwt.ExpiredSignatureError:
            logger.error("❌ 토큰 만료")
            raise ValueError("업로드 토큰이 만료되었습니다.")
        except jwt.InvalidTokenError as e:
            logger.error(f"❌ 토큰 검증 실패: {e}")
            raise ValueError("유효하지 않은 업로드 토큰입니다.")

    def generate_presigned_upload_url(
        self, token: str, content_type: str = "video/mp4"
    ) -> Tuple[str, str]:
        """
        Pre-signed URL 생성

        Args:
            token: 검증된 JWT 토큰
            content_type: 파일 MIME 타입

        Returns:
            (presigned_url, s3_key) 튜플
        """
        # 토큰 검증
        payload = self.validate_upload_token(token)

        # S3 키 생성 (videos/{year}/{month}/{day}/{uuid}_{filename} 형태)
        from datetime import datetime

        now = datetime.utcnow()
        year = now.strftime("%Y")
        month = now.strftime("%m")
        day = now.strftime("%d")

        # UUID 접두어 추가
        upload_id = payload.get("upload_id")
        file_name = payload["file_name"]
        s3_key = f"videos/{year}/{month}/{day}/{upload_id}_{file_name}"

        # Pre-signed URL 생성 (15분 유효)
        try:
            presigned_url = self.s3_client.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": self.bucket_name,
                    "Key": s3_key,
                    "ContentType": content_type,
                    "ContentLength": payload["file_size"],
                },
                ExpiresIn=900,  # 15분
            )

            logger.info(f"📡 Pre-signed URL 생성 완료: key={s3_key}")
            return presigned_url, s3_key

        except Exception as e:
            logger.error(f"❌ Pre-signed URL 생성 실패: {e}")
            raise ValueError(f"업로드 URL 생성에 실패했습니다: {str(e)}")

    def generate_download_url(self, s3_key: str, expires_in: int = 3600) -> str:
        """
        파일 다운로드용 Pre-signed URL 생성

        Args:
            s3_key: S3 객체 키
            expires_in: URL 유효 시간 (초, 기본 1시간)

        Returns:
            Pre-signed 다운로드 URL
        """
        try:
            download_url = self.s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket_name, "Key": s3_key},
                ExpiresIn=expires_in,
            )

            logger.info(f"📥 다운로드 URL 생성: key={s3_key}")
            return download_url

        except Exception as e:
            logger.error(f"❌ 다운로드 URL 생성 실패: {e}")
            raise ValueError(f"다운로드 URL 생성에 실패했습니다: {str(e)}")

    def delete_video(self, s3_key: str) -> bool:
        """
        S3에서 비디오 파일 삭제

        Args:
            s3_key: 삭제할 S3 객체 키

        Returns:
            삭제 성공 여부
        """
        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=s3_key)

            logger.info(f"🗑️ S3 파일 삭제 완료: key={s3_key}")
            return True

        except Exception as e:
            logger.error(f"❌ S3 파일 삭제 실패: {e}")
            return False

    def check_file_exists(self, s3_key: str) -> bool:
        """
        S3에 파일이 존재하는지 확인

        Args:
            s3_key: 확인할 S3 객체 키

        Returns:
            파일 존재 여부
        """
        try:
            self.s3_client.head_object(Bucket=self.bucket_name, Key=s3_key)
            return True
        except:
            return False


# 싱글톤 인스턴스
s3_service = S3VideoUploadService()
