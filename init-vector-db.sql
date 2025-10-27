-- PostgreSQL Vector DB 완전 초기화 스크립트
-- 이 스크립트는 docker-entrypoint-initdb.d에서 자동 실행됩니다

-- 1. pgvector 확장 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 추가 유용한 확장들
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- UUID 생성
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";  -- 쿼리 성능 모니터링

-- 3. 데이터베이스 사용자 생성 (환경변수와 일치)
-- 이미 POSTGRES_USER로 생성되므로 추가 권한만 부여
ALTER USER capstone_user CREATEDB;
GRANT ALL PRIVILEGES ON DATABASE capstone_db TO capstone_user;

-- 4. 스키마 권한 설정
GRANT ALL ON SCHEMA public TO capstone_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO capstone_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO capstone_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO capstone_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO capstone_user;

-- 5. pgvector 설정 최적화
-- 벡터 검색 성능 향상을 위한 설정
ALTER SYSTEM SET shared_preload_libraries = 'vector';
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;

-- 6. 벡터 검색 관련 설정
SET ivfflat.probes = 10;  -- 검색 정확도와 속도 균형

-- 7. 예시 테이블 생성 (실제 테이블은 Django migrations에서 생성)
-- 이 테이블들은 Django models_cloud_complete.py와 구조가 일치해야 합니다

-- 비디오 분석 결과 예시 테이블
CREATE TABLE IF NOT EXISTS example_video_analysis (
    id SERIAL PRIMARY KEY,
    video_id INTEGER NOT NULL,
    analysis_type VARCHAR(50) NOT NULL,
    timestamp FLOAT NOT NULL,
    confidence FLOAT DEFAULT 0.0,
    result_data JSONB DEFAULT '{}',
    
    -- RAG 검색을 위한 벡터 필드 (OpenAI ada-002: 1536차원)
    embedding vector(1536),
    searchable_text TEXT,
    keywords TEXT[] DEFAULT '{}',
    
    -- 데이터 티어링
    data_tier VARCHAR(10) DEFAULT 'hot',
    search_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 메타데이터
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 이벤트 분석 결과 예시 테이블
CREATE TABLE IF NOT EXISTS example_events (
    id SERIAL PRIMARY KEY,
    video_id INTEGER NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    timestamp FLOAT NOT NULL,
    frame_number INTEGER,
    
    -- 인구통계 정보
    age_group VARCHAR(20),
    gender VARCHAR(10),
    emotion VARCHAR(20),
    action VARCHAR(100),
    confidence FLOAT DEFAULT 0.0,
    
    -- RAG 검색용 벡터
    embedding vector(1536),
    searchable_text TEXT,
    keywords TEXT[] DEFAULT '{}',
    
    -- 데이터 티어링
    data_tier VARCHAR(10) DEFAULT 'hot',
    search_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. 벡터 검색을 위한 인덱스 생성
-- 코사인 유사도 인덱스 (가장 일반적)
CREATE INDEX IF NOT EXISTS example_video_analysis_embedding_cosine_idx 
ON example_video_analysis USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS example_events_embedding_cosine_idx 
ON example_events USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 내적 검색 인덱스 (정규화된 벡터용)
CREATE INDEX IF NOT EXISTS example_video_analysis_embedding_ip_idx 
ON example_video_analysis USING ivfflat (embedding vector_ip_ops)
WITH (lists = 100);

-- L2 거리 인덱스 (유클리드 거리)
CREATE INDEX IF NOT EXISTS example_video_analysis_embedding_l2_idx 
ON example_video_analysis USING ivfflat (embedding vector_l2_ops)
WITH (lists = 100);

-- 9. 일반 인덱스 생성 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS example_video_analysis_video_id_idx ON example_video_analysis(video_id);
CREATE INDEX IF NOT EXISTS example_video_analysis_type_idx ON example_video_analysis(analysis_type);
CREATE INDEX IF NOT EXISTS example_video_analysis_tier_idx ON example_video_analysis(data_tier, search_count);
CREATE INDEX IF NOT EXISTS example_video_analysis_timestamp_idx ON example_video_analysis(timestamp);

CREATE INDEX IF NOT EXISTS example_events_video_id_idx ON example_events(video_id);
CREATE INDEX IF NOT EXISTS example_events_type_idx ON example_events(event_type);
CREATE INDEX IF NOT EXISTS example_events_demographics_idx ON example_events(age_group, gender);
CREATE INDEX IF NOT EXISTS example_events_tier_idx ON example_events(data_tier, search_count);

-- 10. 복합 인덱스 (자주 사용되는 쿼리 패턴용)
CREATE INDEX IF NOT EXISTS example_video_analysis_video_type_time_idx 
ON example_video_analysis(video_id, analysis_type, timestamp);

CREATE INDEX IF NOT EXISTS example_events_video_type_time_idx 
ON example_events(video_id, event_type, timestamp);

-- 11. 통계 정보 업데이트
ANALYZE example_video_analysis;
ANALYZE example_events;

-- 12. 권한 재확인
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO capstone_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO capstone_user;

-- 13. 벡터 검색 함수 생성 (편의용)
CREATE OR REPLACE FUNCTION cosine_similarity(a vector, b vector)
RETURNS FLOAT
LANGUAGE SQL
IMMUTABLE STRICT
AS $$
    SELECT 1 - (a <=> b);
$$;

-- 14. 벡터 검색 테스트 함수
CREATE OR REPLACE FUNCTION test_vector_search()
RETURNS TEXT
LANGUAGE SQL
AS $$
    SELECT 'pgvector setup completed successfully. Ready for vector operations.';
$$;

-- 15. 성공 메시지
SELECT test_vector_search();