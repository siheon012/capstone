"""
Hot/Warm/Cold 데이터 계층 관리 서비스
"""
from django.utils import timezone
from datetime import timedelta
from django.db import transaction
import logging
import json
import boto3
from django.conf import settings

logger = logging.getLogger(__name__)

class TierManager:
    """데이터 계층 관리자"""
    
    def __init__(self):
        self.s3_client = boto3.client('s3')
        
    def calculate_hotness_thresholds(self):
        """Hot/Warm/Cold 기준점 계산"""
        return {
            'hot_threshold': 30,    # 30점 이상: Hot
            'warm_threshold': 10,   # 10-30점: Warm  
            'cold_threshold': 0     # 10점 미만: Cold
        }
    
    def analyze_data_temperature(self):
        """모든 데이터의 온도 분석"""
        from .models_cloud import VideoAnalysis
        
        thresholds = self.calculate_hotness_thresholds()
        
        analyses = VideoAnalysis.objects.select_related('video').all()
        
        stats = {
            'hot': [],
            'warm': [], 
            'cold': [],
            'needs_promotion': [],
            'needs_demotion': []
        }
        
        for analysis in analyses:
            hotness = analysis.hotness_score
            current_tier = analysis.storage_tier
            
            # 적절한 계층 결정
            if hotness >= thresholds['hot_threshold']:
                target_tier = 'hot'
            elif hotness >= thresholds['warm_threshold']:
                target_tier = 'warm'
            else:
                target_tier = 'cold'
            
            stats[target_tier].append(analysis)
            
            # 이동이 필요한 데이터 식별
            if current_tier != target_tier:
                if target_tier == 'hot':
                    stats['needs_promotion'].append(analysis)
                else:
                    stats['needs_demotion'].append(analysis)
        
        return stats
    
    def move_to_warm(self, analysis):
        """Hot → Warm 이동"""
        try:
            # 1. S3에 압축된 형태로 저장
            warm_data = {
                'video_id': analysis.video.video_id,
                'frame_timestamp': analysis.frame_timestamp,
                'scene_description': analysis.scene_description,
                'detected_people': analysis.detected_people,
                'detected_actions': analysis.detected_actions,
                'detected_objects': analysis.detected_objects,
                'confidence_score': analysis.confidence_score,
                'search_count': analysis.search_count,
                'last_accessed': analysis.last_accessed.isoformat() if analysis.last_accessed else None
                # embedding은 제외하여 용량 절약
            }
            
            s3_key = f"warm-data/analysis/{analysis.video.video_id}/{analysis.id}.json"
            
            self.s3_client.put_object(
                Bucket=settings.S3_WARM_BUCKET,
                Key=s3_key,
                Body=json.dumps(warm_data, ensure_ascii=False),
                ContentType='application/json',
                StorageClass='STANDARD'
            )
            
            # 2. PostgreSQL에서 임베딩 제거, 메타데이터만 유지
            analysis.embedding_json = None
            analysis.storage_tier = 'warm'
            analysis.s3_warm_key = s3_key
            analysis.save()
            
            logger.info(f"Moved analysis {analysis.id} to Warm storage")
            return True
            
        except Exception as e:
            logger.error(f"Failed to move analysis {analysis.id} to Warm: {str(e)}")
            return False
    
    def move_to_cold(self, analysis):
        """Warm → Cold 이동"""
        try:
            # S3 Lifecycle Policy로 자동 Glacier 이동 설정
            # 여기서는 메타데이터만 업데이트
            analysis.storage_tier = 'cold'
            analysis.save()
            
            logger.info(f"Moved analysis {analysis.id} to Cold storage")
            return True
            
        except Exception as e:
            logger.error(f"Failed to move analysis {analysis.id} to Cold: {str(e)}")
            return False
    
    def promote_to_hot(self, analysis):
        """Warm/Cold → Hot 승격"""
        try:
            if analysis.storage_tier == 'warm':
                # S3에서 데이터 복원
                if hasattr(analysis, 's3_warm_key'):
                    response = self.s3_client.get_object(
                        Bucket=settings.S3_WARM_BUCKET,
                        Key=analysis.s3_warm_key
                    )
                    warm_data = json.loads(response['Body'].read())
                    
                    # 임베딩 재생성 (필요한 경우)
                    if not analysis.embedding_json:
                        embedding = self.regenerate_embedding(analysis.scene_description)
                        analysis.embedding_json = embedding
            
            elif analysis.storage_tier == 'cold':
                # Glacier에서 복원 (시간이 오래 걸림)
                logger.warning(f"Cold storage promotion for {analysis.id} requires Glacier restore")
                # TODO: Glacier restore 로직
            
            analysis.storage_tier = 'hot'
            analysis.save()
            
            logger.info(f"Promoted analysis {analysis.id} to Hot storage")
            return True
            
        except Exception as e:
            logger.error(f"Failed to promote analysis {analysis.id} to Hot: {str(e)}")
            return False
    
    def regenerate_embedding(self, text):
        """Bedrock으로 임베딩 재생성"""
        try:
            bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')
            
            response = bedrock.invoke_model(
                modelId='amazon.titan-embed-text-v1',
                body=json.dumps({
                    "inputText": text
                })
            )
            
            result = json.loads(response['body'].read())
            return result['embedding']
            
        except Exception as e:
            logger.error(f"Failed to regenerate embedding: {str(e)}")
            return None
    
    def run_daily_tier_management(self):
        """일일 계층 관리 작업"""
        logger.info("Starting daily tier management")
        
        stats = self.analyze_data_temperature()
        
        # 성능이 중요한 승격부터 처리
        promoted = 0
        for analysis in stats['needs_promotion']:
            if self.promote_to_hot(analysis):
                promoted += 1
        
        # 비용 절약을 위한 강등 처리
        demoted = 0
        for analysis in stats['needs_demotion']:
            current_tier = analysis.storage_tier
            hotness = analysis.hotness_score
            
            if current_tier == 'hot' and hotness < 30:
                if self.move_to_warm(analysis):
                    demoted += 1
            elif current_tier == 'warm' and hotness < 10:
                if self.move_to_cold(analysis):
                    demoted += 1
        
        logger.info(f"Tier management completed: {promoted} promoted, {demoted} demoted")
        
        return {
            'promoted': promoted,
            'demoted': demoted,
            'total_hot': len(stats['hot']),
            'total_warm': len(stats['warm']),
            'total_cold': len(stats['cold'])
        }

# 편의 함수들
def get_tier_manager():
    """TierManager 인스턴스 반환"""
    return TierManager()

def update_search_stats(video_analysis):
    """검색 통계 업데이트 및 자동 승격 확인"""
    video_analysis.update_access_stats()
    
    # 검색된 데이터가 Hot이 아니면 승격 고려
    if video_analysis.storage_tier != 'hot':
        if video_analysis.hotness_score >= 30:
            tier_manager = get_tier_manager()
            tier_manager.promote_to_hot(video_analysis)