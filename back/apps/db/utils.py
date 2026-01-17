"""
Video processing utility functions
"""

import cv2
import tempfile
import os
import requests
from django.conf import settings


def extract_video_metadata(video_file):
    """
    동영상 파일에서 메타데이터 추출

    Args:
        video_file: Django UploadedFile 객체

    Returns:
        dict: {
            'duration': float,  # 초 단위
            'fps': float,       # 프레임 레이트
            'width': int,       # 해상도 너비
            'height': int,      # 해상도 높이
            'frame_count': int, # 총 프레임 수
        }
    """
    # 임시 파일로 저장 (OpenCV가 파일 경로 필요)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
        try:
            # 청크 단위로 임시 파일에 쓰기
            for chunk in video_file.chunks():
                tmp.write(chunk)
            tmp.flush()

            # OpenCV로 메타데이터 추출
            cap = cv2.VideoCapture(tmp.name)

            if not cap.isOpened():
                raise ValueError("동영상 파일을 열 수 없습니다.")

            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

            # duration 계산 (fps가 0이면 0으로 처리)
            duration = frame_count / fps if fps > 0 else 0

            cap.release()

            metadata = {
                "duration": round(duration, 2),
                "fps": round(fps, 2),
                "width": width,
                "height": height,
                "frame_count": frame_count,
            }

            print(f"✅ [Metadata] 추출 완료: {metadata}")
            return metadata

        except Exception as e:
            print(f"❌ [Metadata] 추출 실패: {str(e)}")
            # 실패 시 기본값 반환
            return {
                "duration": 0,
                "fps": 30.0,  # 기본값
                "width": 1920,  # 기본값
                "height": 1080,  # 기본값
                "frame_count": 0,
            }
        finally:
            # 임시 파일 삭제
            try:
                os.unlink(tmp.name)
            except:
                pass

            # 파일 포인터를 처음으로 되돌림 (재사용 가능하도록)
            video_file.seek(0)


def trigger_video_analysis(video_id, s3_key, s3_bucket):
    """
    Video Analysis FastAPI 컨테이너에 분석 요청 전송

    Args:
        video_id: Video 객체의 ID
        s3_key: S3 객체 키
        s3_bucket: S3 버킷 이름

    Returns:
        bool: 성공 여부
    """
    # Video Analysis FastAPI URL (환경 변수에서 가져옴)
    video_analysis_url = getattr(settings, "VIDEO_ANALYSIS_URL", None)

    if not video_analysis_url:
        print(
            f"⚠️ [Video Analysis] VIDEO_ANALYSIS_URL이 설정되지 않았습니다. 분석을 건너뜁니다."
        )
        return False

    try:
        # 분석 요청 페이로드
        payload = {
            "video_id": video_id,
            "s3_bucket": s3_bucket,
            "s3_key": s3_key,
        }

        # FastAPI 분석 엔드포인트 호출
        response = requests.post(
            f"{video_analysis_url}/analyze",
            json=payload,
            timeout=10,  # 10초 타임아웃 (비동기 처리이므로)
        )

        if response.status_code == 200:
            result = response.json()
            print(
                f"✅ [Video Analysis] 분석 요청 성공: video_id={video_id}, job_id={result.get('job_id')}"
            )
            return True
        else:
            print(
                f"❌ [Video Analysis] 분석 요청 실패: status={response.status_code}, response={response.text}"
            )
            return False

    except requests.exceptions.Timeout:
        print(f"⚠️ [Video Analysis] 요청 타임아웃: video_id={video_id}")
        return False
    except Exception as e:
        print(f"❌ [Video Analysis] 요청 실패: {str(e)}")
        return False
