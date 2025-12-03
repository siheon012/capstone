"""
Bedrock 테스트 전용 간단한 엔드포인트
"""
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.conf import settings
import boto3
import json
from datetime import datetime


@api_view(['GET'])
def test_bedrock_connection(request):
    """
    Bedrock 연결 테스트 엔드포인트
    GET /api/test/bedrock/
    """
    result = {
        'timestamp': datetime.now().isoformat(),
        'bedrock_enabled': settings.USE_BEDROCK,
        'region': settings.AWS_BEDROCK_REGION,
        'model_id': settings.AWS_BEDROCK_MODEL_ID,
        'tests': {}
    }
    
    if not settings.USE_BEDROCK:
        result['status'] = 'disabled'
        result['message'] = 'Bedrock is disabled in settings'
        return Response(result, status=200)
    
    try:
        # 1. Bedrock 클라이언트 생성 테스트
        result['tests']['client_creation'] = {'status': 'attempting'}
        
        bedrock_runtime = boto3.client(
            service_name='bedrock-runtime',
            region_name=settings.AWS_BEDROCK_REGION
        )
        
        result['tests']['client_creation'] = {
            'status': 'success',
            'message': 'Bedrock runtime client created successfully'
        }
        
        # 2. Claude 모델 호출 테스트
        result['tests']['model_invocation'] = {'status': 'attempting'}
        
        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 100,
            "messages": [
                {
                    "role": "user",
                    "content": "안녕하세요! 이것은 Bedrock 연결 테스트입니다. '연결 성공'이라고 간단히 답변해주세요."
                }
            ]
        }
        
        response = bedrock_runtime.invoke_model(
            modelId=settings.AWS_BEDROCK_MODEL_ID,
            body=json.dumps(request_body)
        )
        
        response_body = json.loads(response['body'].read())
        claude_response = response_body['content'][0]['text']
        
        result['tests']['model_invocation'] = {
            'status': 'success',
            'message': 'Claude model invoked successfully',
            'response': claude_response,
            'usage': response_body.get('usage', {})
        }
        
        # 3. Titan Embedding 테스트
        result['tests']['embedding'] = {'status': 'attempting'}
        
        embedding_request = {
            "inputText": "테스트 문장입니다."
        }
        
        embedding_response = bedrock_runtime.invoke_model(
            modelId=settings.AWS_BEDROCK_EMBEDDING_MODEL_ID,
            body=json.dumps(embedding_request)
        )
        
        embedding_body = json.loads(embedding_response['body'].read())
        embedding_vector = embedding_body.get('embedding', [])
        
        result['tests']['embedding'] = {
            'status': 'success',
            'message': 'Titan embedding generated successfully',
            'dimension': len(embedding_vector)
        }
        
        # 최종 상태
        result['status'] = 'success'
        result['message'] = '✅ All Bedrock tests passed!'
        
        return Response(result, status=200)
        
    except Exception as e:
        result['status'] = 'error'
        result['error'] = str(e)
        result['error_type'] = type(e).__name__
        
        # 일반적인 오류 원인 제공
        if 'AccessDeniedException' in str(e):
            result['suggestion'] = 'IAM 역할에 bedrock:InvokeModel 권한이 없습니다. Bedrock 모델 액세스를 확인하세요.'
        elif 'ResourceNotFoundException' in str(e):
            result['suggestion'] = f'모델 ID가 잘못되었거나 해당 리전에서 사용할 수 없습니다: {settings.AWS_BEDROCK_MODEL_ID}'
        elif 'ValidationException' in str(e):
            result['suggestion'] = '요청 형식이 올바르지 않습니다. 모델 ID와 요청 본문을 확인하세요.'
        else:
            result['suggestion'] = 'AWS 자격 증명 또는 네트워크 연결을 확인하세요.'
        
        return Response(result, status=500)


@api_view(['POST'])
def test_bedrock_chat(request):
    """
    Bedrock Chat 테스트 엔드포인트
    POST /api/test/bedrock/chat/
    Body: { "message": "your message here" }
    """
    if not settings.USE_BEDROCK:
        return Response({
            'error': 'Bedrock is disabled in settings'
        }, status=400)
    
    message = request.data.get('message', '안녕하세요!')
    
    try:
        bedrock_runtime = boto3.client(
            service_name='bedrock-runtime',
            region_name=settings.AWS_BEDROCK_REGION
        )
        
        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 500,
            "messages": [
                {
                    "role": "user",
                    "content": message
                }
            ]
        }
        
        response = bedrock_runtime.invoke_model(
            modelId=settings.AWS_BEDROCK_MODEL_ID,
            body=json.dumps(request_body)
        )
        
        response_body = json.loads(response['body'].read())
        
        return Response({
            'status': 'success',
            'user_message': message,
            'claude_response': response_body['content'][0]['text'],
            'usage': response_body.get('usage', {}),
            'model_id': settings.AWS_BEDROCK_MODEL_ID,
            'timestamp': datetime.now().isoformat()
        }, status=200)
        
    except Exception as e:
        return Response({
            'status': 'error',
            'error': str(e),
            'error_type': type(e).__name__
        }, status=500)
