import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const THUMBNAIL_DIR = join(process.cwd(), 'public', 'uploads', 'thumbnails');

// 썸네일 디렉토리 생성 함수
async function ensureThumbnailDir() {
  try {
    if (!existsSync(THUMBNAIL_DIR)) {
      await mkdir(THUMBNAIL_DIR, { recursive: true });
      console.log('썸네일 디렉토리 생성:', THUMBNAIL_DIR);
    }
  } catch (error) {
    console.error('썸네일 디렉토리 생성 실패:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('썸네일 업로드 요청 받음');

    // 썸네일 디렉토리 확인 및 생성
    await ensureThumbnailDir();

    const formData = await request.formData();
    const thumbnail = formData.get('thumbnail') as File;
    const fileName = formData.get('fileName') as string;

    if (!thumbnail || !fileName) {
      console.error('썸네일 파일 또는 파일명이 없음');
      return NextResponse.json(
        { success: false, error: '썸네일 파일 또는 파일명이 필요합니다.' },
        { status: 400 }
      );
    }

    console.log('썸네일 업로드 정보:', {
      fileName,
      size: thumbnail.size,
      type: thumbnail.type,
    });

    // 파일 버퍼로 변환
    const bytes = await thumbnail.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 썸네일 저장 경로
    const thumbnailPath = join(THUMBNAIL_DIR, fileName);

    // 파일 저장
    await writeFile(thumbnailPath, buffer);

    console.log('썸네일 저장 완료:', thumbnailPath);

    return NextResponse.json({
      success: true,
      thumbnailPath: `/uploads/thumbnails/${fileName}`,
    });
  } catch (error) {
    console.error('썸네일 업로드 오류:', error);
    return NextResponse.json(
      { success: false, error: '썸네일 업로드 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
