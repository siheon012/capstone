from rest_framework import serializers
from apps.db.models import Event


class EventSerializer(serializers.ModelSerializer):
    # 기존 호환성 필드들
    timestamp_display = serializers.ReadOnlyField()
    absolute_time = serializers.ReadOnlyField()
    absolute_time_display = serializers.ReadOnlyField()
    
    # attributes JSON에서 가져오는 필드들 (ReadOnlyField로 @property 사용)
    age = serializers.ReadOnlyField()
    location = serializers.ReadOnlyField()
    action_detected = serializers.ReadOnlyField()
    obj_id = serializers.ReadOnlyField()
    area_of_interest = serializers.ReadOnlyField()
    gender_score = serializers.ReadOnlyField()
    scene_analysis = serializers.ReadOnlyField()
    orientataion = serializers.ReadOnlyField()
    
    # confidence는 모델 필드 (JSONField가 아님)
    # confidence = serializers.FloatField(read_only=True)  # 이미 Meta의 fields='__all__'에 포함됨
    
    # 새로운 클라우드 필드들
    searchable_content = serializers.SerializerMethodField()
    similarity_score = serializers.SerializerMethodField()
    tier_info = serializers.SerializerMethodField()
    
    # 썸네일 URL (Presigned URL 자동 생성)
    thumbnail_url = serializers.SerializerMethodField()
    
    class Meta:
        model = Event
        fields = '__all__'
    
    def get_thumbnail_url(self, obj):
        """썸네일 Presigned URL 생성"""
        return obj.thumbnail_url  # @property 메서드 사용
    
    def get_searchable_content(self, obj):
        """검색 가능한 내용 생성"""
        if hasattr(obj, 'searchable_text') and obj.searchable_text:
            return obj.searchable_text
        # 기존 필드들로 검색 텍스트 생성
        parts = [
            getattr(obj, 'event_type', ''),
            getattr(obj, 'age_group', ''),
            getattr(obj, 'gender', ''),
            getattr(obj, 'action', ''),
            getattr(obj, 'emotion', '')
        ]
        return " | ".join(filter(None, parts))
    
    def get_similarity_score(self, obj):
        """벡터 검색 결과의 유사도 점수 (context에서 주입)"""
        return getattr(obj, '_similarity_score', None)
    
    def get_tier_info(self, obj):
        """데이터 티어 정보"""
        return {
            'tier': getattr(obj, 'data_tier', 'hot'),
            'search_count': getattr(obj, 'search_count', 0),
            'last_accessed': getattr(obj, 'last_accessed', None)
        }
