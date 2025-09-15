#!/usr/bin/env python
"""
SQS 통합 테스트 스크립트
S3 업로드 완료 → SQS 메시지 발행 테스트
"""

import os
import sys
import django
from pathlib import Path

# Django 설정
BASE_DIR = Path(__file__).resolve().parent
sys.path.append(str(BASE_DIR / 'back'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from back.apps.api.services.sqs_service import sqs_service


def test_sqs_message():
    """SQS 메시지 발송 테스트"""
    print("SQS 메시지 발송 테스트 시작...")
    
    # 테스트 데이터
    test_data = {
        's3_bucket': 'capstone-local-video-bucket',
        's3_key': 'videos/test/2024/test-video.mp4',
        'video_id': '12345',
        'additional_data': {
            'video_name': 'test-video.mp4',
            'file_size': 1048576,
            'duration': 120.5
        }
    }
    
    # SQS 메시지 발송
    result = sqs_service.send_video_processing_message(**test_data)
    
    if result['success']:
        print(f"SQS 메시지 발송 성공!")
        print(f"   Message ID: {result['message_id']}")
        print(f"   MD5: {result['md5_of_body']}")
    else:
        print(f"SQS 메시지 발송 실패: {result['error']}")
    
    return result


def test_sqs_receive():
    """SQS 메시지 수신 테스트 (Long Polling)"""
    print("\nSQS 메시지 수신 테스트 시작...")
    print("Long Polling으로 메시지 대기 중... (최대 5초)")
    
    # 짧은 대기시간으로 테스트
    messages = sqs_service.receive_messages(
        max_messages=1,
        wait_time_seconds=5,  # 5초만 대기
        visibility_timeout=30
    )
    
    if messages:
        print(f"{len(messages)}개 메시지 수신:")
        for i, message in enumerate(messages, 1):
            print(f"   메시지 {i}:")
            print(f"   - Body: {message.get('Body', 'N/A')}")
            print(f"   - MessageId: {message.get('MessageId', 'N/A')}")
            print(f"   - ReceiptHandle: {message.get('ReceiptHandle', 'N/A')[:50]}...")
    else:
        print("수신된 메시지가 없습니다.")
    
    return messages


if __name__ == "__main__":
    try:
        # 1. 메시지 발송 테스트
        send_result = test_sqs_message()
        
        # 2. 메시지 수신 테스트 (발송이 성공한 경우)
        if send_result.get('success'):
            receive_result = test_sqs_receive()
            
            # 3. 메시지 삭제 테스트 (수신된 메시지가 있는 경우)
            if receive_result:
                print("\nSQS 메시지 삭제 테스트 시작...")
                receipt_handle = receive_result[0]['ReceiptHandle']
                delete_result = sqs_service.delete_message(receipt_handle)
                
                if delete_result:
                    print("메시지 삭제 성공!")
                else:
                    print("메시지 삭제 실패!")
        
    except Exception as e:
        print(f"테스트 실행 중 오류: {e}")
        import traceback
        traceback.print_exc()