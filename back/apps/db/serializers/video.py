from rest_framework import serializers
from django.conf import settings
import boto3
from botocore.exceptions import ClientError
from apps.db.models import Video


class VideoSerializer(serializers.ModelSerializer):
    # 기존 호환성 필드들
    file_path = serializers.ReadOnlyField()
    computed_thumbnail_path = serializers.ReadOnlyField()
    chat_count = serializers.SerializerMethodField()

    # 새로운 클라우드 필드들
    current_s3_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()
    tier_status = serializers.SerializerMethodField()
    search_stats = serializers.SerializerMethodField()

    class Meta:
        model = Video
        fields = "__all__"

    def get_chat_count(self, obj):
        """실제 PromptSession 수를 계산하여 반환 (기존 호환성)"""
        if hasattr(obj, "prompt_sessions"):
            return obj.prompt_sessions.count()
        return 0

    def get_current_s3_url(self, obj):
        """현재 티어에 맞는 S3 URL 생성"""
        try:
            if hasattr(obj, "get_current_s3_key") and obj.get_current_s3_key():
                s3_url = self._generate_s3_url(obj.get_current_s3_key())
                if s3_url:
                    return s3_url
            # Fallback: S3 공개 URL (presigned URL 실패 시)
            s3_key = getattr(obj, "s3_key", None) or getattr(obj, "s3_raw_key", None)
            if s3_key:
                bucket_name = settings.AWS_STORAGE_BUCKET_NAME
                region = settings.AWS_S3_REGION_NAME
                return f"https://{bucket_name}.s3.{region}.amazonaws.com/{s3_key}"
        except Exception as e:
            print(f"⚠️ current_s3_url 생성 실패: {e}")
        return None

    def get_thumbnail_url(self, obj):
        """썸네일 S3 URL 생성"""
        try:
            thumbnail_key = getattr(obj, "thumbnail_s3_key", None) or getattr(
                obj, "s3_thumbnail_key", None
            )
            if thumbnail_key:
                s3_url = self._generate_s3_url(thumbnail_key, is_thumbnail=True)
                if s3_url:
                    return s3_url
                # Fallback: S3 공개 URL
                bucket_name = settings.AWS_THUMBNAILS_BUCKET_NAME
                region = settings.AWS_S3_REGION_NAME
                return (
                    f"https://{bucket_name}.s3.{region}.amazonaws.com/{thumbnail_key}"
                )
        except Exception as e:
            print(f"⚠️ thumbnail_url 생성 실패: {e}")
        return None

    def get_tier_status(self, obj):
        """데이터 티어 상태 정보"""
        return {
            "tier": getattr(obj, "data_tier", "hot"),
            "hotness_score": getattr(obj, "hotness_score", 0.0),
            "search_count": getattr(obj, "search_count", 0),
        }

    def get_search_stats(self, obj):
        """검색 통계 정보"""
        return {
            "total_searches": getattr(obj, "search_count", 0)
            or getattr(obj, "total_searches", 0),
            "last_accessed": getattr(obj, "last_accessed", None)
            or getattr(obj, "last_searched", None),
            "hotness_score": getattr(obj, "hotness_score", 0.0),
        }

    def _generate_s3_url(self, s3_key, is_thumbnail=False):
        """S3 pre-signed URL 생성"""
        if not s3_key:
            return None

        try:
            # AWS credentials와 region 명시적으로 설정
            s3_client = boto3.client(
                "s3",
                region_name=settings.AWS_S3_REGION_NAME,
                aws_access_key_id=getattr(settings, "AWS_ACCESS_KEY_ID", None),
                aws_secret_access_key=getattr(settings, "AWS_SECRET_ACCESS_KEY", None),
            )

            # 썸네일은 별도 버킷 사용
            bucket_name = (
                settings.AWS_THUMBNAILS_BUCKET_NAME
                if is_thumbnail
                else settings.AWS_STORAGE_BUCKET_NAME
            )

            presigned_url = s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket_name, "Key": s3_key},
                ExpiresIn=3600,  # 1시간
            )
            return presigned_url
        except ClientError as e:
            print(f"❌ S3 presigned URL 생성 실패: {e}")
            return None
        except Exception as e:
            print(f"❌ 예상치 못한 에러: {e}")
            return None

    def create(self, validated_data):
        """비디오 생성 시 클라우드 필드 초기화"""
        print(f"🏗️ [VideoSerializer CREATE] 시작")
        print(f"📋 [VideoSerializer CREATE] Validated data: {validated_data}")

        try:
            # 기본 생성
            instance = super().create(validated_data)

            # 클라우드 필드 초기화
            if hasattr(instance, "data_tier") and not instance.data_tier:
                instance.data_tier = "hot"
            if hasattr(instance, "hotness_score") and not instance.hotness_score:
                instance.hotness_score = 100.0  # 새 비디오는 hot

            instance.save()

            print(
                f"✅ [VideoSerializer CREATE] 생성 성공: video_id={instance.video_id}"
            )
            return instance

        except Exception as e:
            print(f"❌ [VideoSerializer CREATE] 오류 발생: {str(e)}")
            import traceback

            print(f"📚 [VideoSerializer CREATE] Traceback: {traceback.format_exc()}")
            raise
