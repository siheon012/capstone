#!/usr/bin/env python3
"""
가시성 타임아웃 관리 테스트 스크립트
SQS 메시지의 가시성 타임아웃 동적 관리 테스트
"""

import os
import sys
import time
import json
from pathlib import Path

# Django 설정
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DJANGO_ROOT = PROJECT_ROOT / 'back'

sys.path.insert(0, str(DJANGO_ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

try:
    import django
    django.setup()
    
    from apps.api.services.sqs_service import sqs_service
    print("✅ Django 모듈 로드 완료")
except Exception as e:
    print(f"❌ Django 모듈 로드 실패: {e}")
    sys.exit(1)

# 가시성 타임아웃 매니저
from visibility_manager import VisibilityTimeoutManager


def test_visibility_timeout_management():
    """가시성 타임아웃 관리 테스트"""
    print("\n🧪 가시성 타임아웃 관리 테스트 시작...")
    
    # 가시성 매니저 초기화
    visibility_manager = VisibilityTimeoutManager(sqs_service)
    
    try:
        # 1. 테스트 메시지 발송
        print("\n📤 테스트 메시지 발송...")
        test_message = {
            's3_bucket': 'test-bucket',
            's3_key': 'test-video.mp4',
            'video_id': 'test-123',
            'additional_data': {
                'test': True,
                'purpose': 'visibility_timeout_test'
            }
        }
        
        send_result = sqs_service.send_video_processing_message(**test_message)
        if not send_result['success']:
            print(f"❌ 메시지 발송 실패: {send_result['error']}")
            return
        
        print(f"✅ 테스트 메시지 발송 성공: {send_result['message_id']}")
        
        # 2. 메시지 수신
        print("\n📥 메시지 수신 중...")
        messages = sqs_service.receive_messages(
            max_messages=1,
            wait_time_seconds=5,
            visibility_timeout=60  # 1분 초기 가시성 타임아웃
        )
        
        if not messages:
            print("❌ 수신된 메시지가 없습니다")
            return
        
        message = messages[0]
        receipt_handle = message['ReceiptHandle']
        print(f"✅ 메시지 수신 성공: {receipt_handle[:20]}...")
        
        # 3. 가시성 타임아웃 매니저 시작
        print("\n⏰ 가시성 타임아웃 모니터링 시작...")
        visibility_manager.start_monitoring()
        
        # 4. 메시지 등록 (2분 예상 처리 시간)
        visibility_manager.register_message(receipt_handle, 'test-123', 120)
        
        # 5. 모의 처리 작업 (여러 단계로 처리 시뮬레이션)
        print("\n🔄 모의 비디오 처리 시작...")
        processing_steps = [
            ("비디오 다운로드", 30),
            ("프레임 추출", 45), 
            ("GPU 추론", 90),
            ("결과 업로드", 15)
        ]
        
        for step_name, duration in processing_steps:
            print(f"   🔧 {step_name} 중... ({duration}초)")
            
            # 중간에 수동으로 가시성 연장 테스트
            if step_name == "GPU 추론":
                print("   ⏰ 중간 가시성 연장...")
                visibility_manager.extend_visibility(receipt_handle, 180)
            
            time.sleep(min(duration, 30))  # 실제로는 최대 30초만 대기
            print(f"   ✅ {step_name} 완료")
        
        # 6. 처리 완료
        print("\n✅ 모의 처리 완료 - 메시지 삭제")
        sqs_service.delete_message(receipt_handle)
        visibility_manager.unregister_message(receipt_handle, 'completed')
        
        # 7. 상태 확인
        active_count = visibility_manager.get_active_message_count()
        print(f"📊 현재 활성 메시지 수: {active_count}")
        
        print("\n🎉 가시성 타임아웃 관리 테스트 완료!")
        
    except Exception as e:
        print(f"❌ 테스트 실행 중 오류: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # 모니터링 중지
        visibility_manager.stop_monitoring()
        print("\n🛑 가시성 타임아웃 모니터링 중지")


def test_timeout_scenarios():
    """다양한 타임아웃 시나리오 테스트"""
    print("\n🧪 타임아웃 시나리오 테스트...")
    
    visibility_manager = VisibilityTimeoutManager(sqs_service)
    
    # 더 짧은 설정으로 빠른 테스트
    visibility_manager.max_processing_time = 180  # 3분 최대 처리 시간
    visibility_manager.extension_interval = 60   # 1분마다 연장 체크
    
    try:
        visibility_manager.start_monitoring()
        
        # 가상의 receipt_handle로 테스트
        fake_receipt_handle = "test-receipt-handle-123"
        
        # 메시지 등록
        visibility_manager.register_message(fake_receipt_handle, 'timeout-test', 60)
        
        print("⏳ 3분 30초 대기 중... (최대 처리 시간 초과 테스트)")
        for i in range(7):  # 30초씩 7번 = 3분 30초
            time.sleep(30)
            active_count = visibility_manager.get_active_message_count()
            print(f"   📊 {i*30 + 30}초 경과, 활성 메시지: {active_count}개")
            
            if active_count == 0:
                print("✅ 메시지가 타임아웃으로 자동 제거됨")
                break
        
        print("🎉 타임아웃 시나리오 테스트 완료!")
        
    finally:
        visibility_manager.stop_monitoring()


if __name__ == "__main__":
    print("🚀 SQS 가시성 타임아웃 관리 테스트")
    
    try:
        # 기본 테스트
        test_visibility_timeout_management()
        
        # 추가 시나리오 테스트 (선택사항)
        response = input("\n타임아웃 시나리오 테스트를 실행하시겠습니까? (y/N): ")
        if response.lower() == 'y':
            test_timeout_scenarios()
            
    except KeyboardInterrupt:
        print("\n\n⏹️ 테스트 중단됨")
    except Exception as e:
        print(f"\n❌ 테스트 실행 오류: {e}")
        import traceback
        traceback.print_exc()