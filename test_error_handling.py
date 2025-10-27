#!/usr/bin/env python3
"""
오류 처리 및 재시도 로직 테스트
Step 5 구현 검증
"""

import sys
import time
import json
from pathlib import Path

# 프로젝트 경로 추가
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR / 'gpu_worker'))

from gpu_worker.error_handler import (
    retry_manager, 
    error_tracker, 
    ErrorType,
    retry_on_error,
    safe_execute
)

def test_error_classification():
    """오류 분류 테스트"""
    print("🧪 오류 분류 테스트")
    print("-" * 40)
    
    test_cases = [
        (ConnectionError("네트워크 연결 실패"), ErrorType.TEMPORARY),
        (FileNotFoundError("파일 없음"), ErrorType.PERMANENT), 
        (MemoryError("메모리 부족"), ErrorType.SYSTEM),
        (ValueError("잘못된 값"), ErrorType.PERMANENT),
        (RuntimeError("런타임 오류"), ErrorType.SYSTEM)
    ]
    
    for exception, expected_type in test_cases:
        classified_type = retry_manager.classify_error(exception)
        status = "✅" if classified_type == expected_type else "❌"
        print(f"{status} {type(exception).__name__}: {classified_type.value} (예상: {expected_type.value})")
    
    print()

def test_retry_backoff():
    """재시도 백오프 계산 테스트"""
    print("🧪 재시도 백오프 계산 테스트")
    print("-" * 40)
    
    for attempt in range(1, 6):
        delay = retry_manager.calculate_delay(attempt)
        print(f"시도 {attempt}: {delay:.1f}초 대기")
    
    print()

def simulate_temporary_error(fail_count: int = 2):
    """일시적 오류 시뮬레이션"""
    if not hasattr(simulate_temporary_error, 'call_count'):
        simulate_temporary_error.call_count = 0
    
    simulate_temporary_error.call_count += 1
    
    if simulate_temporary_error.call_count <= fail_count:
        raise ConnectionError(f"일시적 네트워크 오류 (시도 {simulate_temporary_error.call_count})")
    
    return f"성공! (총 {simulate_temporary_error.call_count}번 시도)"

def simulate_permanent_error():
    """영구적 오류 시뮬레이션"""
    raise FileNotFoundError("파일을 찾을 수 없음 - 영구적 오류")

def test_retry_mechanism():
    """재시도 메커니즘 테스트"""
    print("🧪 재시도 메커니즘 테스트")
    print("-" * 40)
    
    # 일시적 오류 재시도 테스트
    print("1. 일시적 오류 재시도 테스트:")
    try:
        # call_count 초기화
        simulate_temporary_error.call_count = 0
        
        result = retry_manager.retry_with_backoff(
            simulate_temporary_error,
            fail_count=2,  # 2번 실패 후 성공
            context="일시적 오류 테스트"
        )
        print(f"   ✅ 재시도 성공: {result}")
    except Exception as e:
        print(f"   ❌ 재시도 실패: {e}")
    
    print()
    
    # 영구적 오류 즉시 실패 테스트
    print("2. 영구적 오류 즉시 실패 테스트:")
    try:
        result = retry_manager.retry_with_backoff(
            simulate_permanent_error,
            context="영구적 오류 테스트"
        )
        print(f"   ❌ 예상치 못한 성공: {result}")
    except FileNotFoundError as e:
        print(f"   ✅ 올바른 즉시 실패: {type(e).__name__}: {e}")
    except Exception as e:
        print(f"   ❌ 예상치 못한 오류: {type(e).__name__}: {e}")
    
    print()

@retry_on_error(max_retries=2, context="데코레이터 테스트")
def decorated_function(should_fail: bool = True):
    """데코레이터 테스트용 함수"""
    if should_fail:
        raise ConnectionError("데코레이터 테스트 오류")
    return "데코레이터 성공!"

def test_decorator():
    """데코레이터 테스트"""
    print("🧪 @retry_on_error 데코레이터 테스트")
    print("-" * 40)
    
    try:
        result = decorated_function(should_fail=False)
        print(f"   ✅ 정상 실행: {result}")
    except Exception as e:
        print(f"   ❌ 예상치 못한 실패: {e}")
    
    try:
        result = decorated_function(should_fail=True) 
        print(f"   ❌ 예상치 못한 성공: {result}")
    except Exception as e:
        print(f"   ✅ 올바른 실패 처리: {type(e).__name__}: {e}")
    
    print()

def test_safe_execute():
    """안전 실행 테스트"""
    print("🧪 safe_execute 테스트") 
    print("-" * 40)
    
    # 성공 케이스
    success, result = safe_execute(
        lambda x, y: x + y,
        10, 20,
        context="덧셈 테스트"
    )
    print(f"   성공 케이스: success={success}, result={result}")
    
    # 실패 케이스
    success, error = safe_execute(
        lambda: 1 / 0,
        context="0으로 나누기 테스트"
    )
    print(f"   실패 케이스: success={success}, error={type(error).__name__}")
    
    print()

def test_error_tracking():
    """오류 추적 테스트"""
    print("🧪 오류 추적 테스트")
    print("-" * 40)
    
    # 다양한 오류 기록
    errors_to_record = [
        (ValueError("테스트 값 오류"), "값 검증", "test_function1"),
        (ConnectionError("테스트 연결 오류"), "네트워크 호출", "test_function2"),
        (FileNotFoundError("테스트 파일 오류"), "파일 읽기", "test_function1"),
    ]
    
    for error, context, func_name in errors_to_record:
        error_tracker.record_error(error, context, func_name)
    
    # 통계 출력
    summary = error_tracker.get_error_summary()
    print(f"   전체 오류: {summary['total_errors']}건")
    print(f"   오류 타입: {summary['error_types']}개")
    print(f"   가장 빈번한 오류: {summary['most_common_error']}")
    print(f"   오류 발생 함수: {summary['functions_with_errors']}개")
    
    # 상세 통계
    detailed_stats = error_tracker.get_detailed_stats()
    print(f"   타입별 통계: {detailed_stats['by_type']}")
    print(f"   함수별 통계: {detailed_stats['by_function']}")
    
    print()

def main():
    """메인 테스트 함수"""
    print("🚀 오류 처리 및 재시도 로직 테스트 시작")
    print("=" * 60)
    print()
    
    try:
        test_error_classification()
        test_retry_backoff()
        test_retry_mechanism()
        test_decorator()
        test_safe_execute()
        test_error_tracking()
        
        print("✅ 모든 테스트 완료!")
        print("=" * 60)
        
        # 최종 오류 통계 
        final_summary = error_tracker.get_error_summary()
        print("📊 최종 오류 통계:")
        print(f"   기록된 총 오류: {final_summary['total_errors']}건")
        
    except Exception as e:
        print(f"❌ 테스트 실행 중 오류: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()