"use server"

import type { UploadedVideo, VideoListResponse } from "@/app/types/video"
import { mkdir } from "fs/promises"
import { join } from "path"
import { existsSync } from "fs"

// 업로드 디렉토리 설정
const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "videos")

// 디렉토리 생성 함수
async function ensureUploadDir() {
  try {
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true })
    }
  } catch (error) {
    console.error("Failed to create upload directory:", error)
  }
}

// 비디오 파일 저장
// 배포 환경에서는 파일 시스템 대신 메모리나 외부 스토리지 사용
export async function saveVideoFile(
  formData: FormData,
): Promise<{ success: boolean; videoId?: string; filePath?: string; error?: string }> {
  try {
    const file = formData.get("video") as File
    if (!file) {
      return { success: false, error: "파일이 없습니다." }
    }

    // 파일 검증
    if (!file.type.startsWith("video/")) {
      return { success: false, error: "비디오 파일만 업로드 가능합니다." }
    }

    // 파일 크기 제한 (100MB)
    const maxSize = 100 * 1024 * 1024
    if (file.size > maxSize) {
      return { success: false, error: "파일 크기는 100MB를 초과할 수 없습니다." }
    }

    // 고유 파일명 생성
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substr(2, 9)
    const videoId = `video_${timestamp}_${randomId}`
    const fileExtension = file.name.split(".").pop() || "mp4"
    const fileName = `${videoId}.${fileExtension}`

    // 배포 환경에서는 실제 파일 저장 대신 임시 처리
    // 실제 프로덕션에서는 AWS S3, Cloudinary 등 외부 스토리지 사용 권장
    console.log("Video file processed:", {
      videoId,
      fileName,
      size: file.size,
      type: file.type,
    })

    // 비디오 메타데이터 (실제로는 데이터베이스에 저장해야 함)
    const videoData: UploadedVideo = {
      id: videoId,
      name: fileName,
      originalName: file.name,
      filePath: `/uploads/videos/${fileName}`, // 임시 경로
      duration: 0,
      size: file.size,
      uploadDate: new Date(),
      chatCount: 0,
      majorEvent: null,
    }

    // TODO: 실제 데이터베이스에 저장
    console.log("Video metadata saved:", videoData)

    return {
      success: true,
      videoId,
      filePath: `/uploads/videos/${fileName}`, // 임시 경로 반환
    }
  } catch (error) {
    console.error("Video save error:", error)
    return { success: false, error: "파일 저장 중 오류가 발생했습니다." }
  }
}

// 업로드된 비디오 목록 가져오기
export async function getUploadedVideos(): Promise<VideoListResponse> {
  try {
    // TODO: 실제로는 데이터베이스에서 가져와야 함
    // 현재는 더미 데이터 반환
    const dummyVideos: UploadedVideo[] = [
      {
        id: "video_1704067200_abc123",
        name: "parking_lot_20240101.mp4",
        originalName: "주차장_CCTV_2024년1월1일.mp4",
        filePath: "/uploads/videos/parking_lot_20240101.mp4",
        duration: 3600, // 1시간
        size: 524288000, // 500MB
        uploadDate: new Date("2024-01-01T10:00:00"),
        thumbnail: "/placeholder.svg?height=120&width=200",
        chatCount: 15,
        majorEvent: "도난",
        description: "주차장에서 발생한 차량 도난 사건",
      },
      {
        id: "video_1704153600_def456",
        name: "store_entrance_20240102.mp4",
        originalName: "매장입구_CCTV_2024년1월2일.mp4",
        filePath: "/uploads/videos/store_entrance_20240102.mp4",
        duration: 7200, // 2시간
        size: 1048576000, // 1GB
        uploadDate: new Date("2024-01-02T14:30:00"),
        thumbnail: "/placeholder.svg?height=120&width=200",
        chatCount: 8,
        majorEvent: null,
        description: "매장 입구 일반 모니터링",
      },
      {
        id: "video_1704240000_ghi789",
        name: "office_hallway_20240103.mp4",
        originalName: "사무실복도_CCTV_2024년1월3일.mp4",
        filePath: "/uploads/videos/office_hallway_20240103.mp4",
        duration: 1800, // 30분
        size: 209715200, // 200MB
        uploadDate: new Date("2024-01-03T09:15:00"),
        thumbnail: "/placeholder.svg?height=120&width=200",
        chatCount: 3,
        majorEvent: "쓰러짐",
        description: "사무실 복도에서 발생한 응급상황",
      },
      {
        id: "video_1704326400_jkl012",
        name: "warehouse_20240104.mp4",
        originalName: "창고_CCTV_2024년1월4일.mp4",
        filePath: "/uploads/videos/warehouse_20240104.mp4",
        duration: 5400, // 1.5시간
        size: 734003200, // 700MB
        uploadDate: new Date("2024-01-04T16:45:00"),
        thumbnail: "/placeholder.svg?height=120&width=200",
        chatCount: 12,
        majorEvent: "폭행",
        description: "창고 내 폭행 사건 발생",
      },
      {
        id: "video_1704412800_mno345",
        name: "lobby_20240105.mp4",
        originalName: "로비_CCTV_2024년1월5일.mp4",
        filePath: "/uploads/videos/lobby_20240105.mp4",
        duration: 2700, // 45분
        size: 367001600, // 350MB
        uploadDate: new Date("2024-01-05T11:20:00"),
        thumbnail: "/placeholder.svg?height=120&width=200",
        chatCount: 6,
        majorEvent: null,
        description: "로비 일반 모니터링",
      },
    ]

    return { success: true, data: dummyVideos }
  } catch (error) {
    console.error("Failed to get uploaded videos:", error)
    return { success: false, data: [], error: "비디오 목록을 불러오는 중 오류가 발생했습니다." }
  }
}

// 비디오 삭제
export async function deleteVideo(videoId: string): Promise<boolean> {
  try {
    // TODO: 실제로는 파일 시스템과 데이터베이스에서 삭제
    console.log("Video deleted:", videoId)
    return true
  } catch (error) {
    console.error("Video delete error:", error)
    return false
  }
}

// 비디오 메타데이터 업데이트
export async function updateVideoMetadata(videoId: string, updates: Partial<UploadedVideo>): Promise<boolean> {
  try {
    // TODO: 데이터베이스 업데이트
    console.log("Video metadata updated:", videoId, updates)
    return true
  } catch (error) {
    console.error("Video metadata update error:", error)
    return false
  }
}
