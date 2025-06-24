import logging
import time

logger = logging.getLogger(__name__)

class RequestLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # 요청 시작 시간 기록
        start_time = time.time()
        
        # 요청 정보 로깅 (대용량 데이터는 크기만 표시)
        content_length = request.META.get('CONTENT_LENGTH', 0)
        if content_length:
            try:
                content_length = int(content_length)
            except (ValueError, TypeError):
                content_length = 0
        else:
            content_length = 0
        
        print(f"🌍 [REQUEST] {request.method} {request.path}")
        if content_length > 0:
            print(f"📏 [REQUEST] Content-Length: {content_length} bytes ({content_length / (1024*1024):.2f} MB)")
        else:
            print(f"📏 [REQUEST] Content-Length: {content_length} bytes")
        print(f"🔍 [REQUEST] Content-Type: {request.content_type}")
        print(f"🌐 [REQUEST] Remote IP: {request.META.get('REMOTE_ADDR', 'Unknown')}")
        print(f"🔧 [REQUEST] User-Agent: {request.META.get('HTTP_USER_AGENT', 'Unknown')[:100]}")
        
        # 특정 경로에 대한 추가 로깅
        if '/api/videos/' in request.path:
            print(f"🎬 [VIDEO API] 요청 감지됨")
            if request.method == 'POST':
                print(f"🎬 [VIDEO API] POST 요청 - 비디오 생성 시도")
                print(f"🎬 [VIDEO API] Headers: {dict(request.headers)}")
        
        response = self.get_response(request)
        
        # 응답 시간 계산
        end_time = time.time()
        duration = end_time - start_time
        
        print(f"✅ [RESPONSE] {request.method} {request.path} - {response.status_code} ({duration:.2f}s)")
        
        return response

    def process_exception(self, request, exception):
        print(f"❌ [EXCEPTION] {request.method} {request.path} - {type(exception).__name__}: {str(exception)}")
        return None
