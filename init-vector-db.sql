-- PostgreSQL Vector DB 초기화 스크립트
-- pgvector 확장 활성화

CREATE EXTENSION IF NOT EXISTS vector;

-- 영상 분석 결과 테이블 생성 예시
CREATE TABLE IF NOT EXISTS video_analysis (
    id SERIAL PRIMARY KEY,
    video_id INTEGER NOT NULL,
    analysis_type VARCHAR(50) NOT NULL,
    embedding vector(768),  -- 768차원 벡터 (모델에 따라 조정)
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 벡터 검색을 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS video_analysis_embedding_idx 
ON video_analysis USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 메타데이터 검색을 위한 인덱스
CREATE INDEX IF NOT EXISTS video_analysis_video_id_idx ON video_analysis(video_id);
CREATE INDEX IF NOT EXISTS video_analysis_type_idx ON video_analysis(analysis_type);

-- 권한 설정
GRANT ALL PRIVILEGES ON TABLE video_analysis TO vector_user;
GRANT USAGE, SELECT ON SEQUENCE video_analysis_id_seq TO vector_user;