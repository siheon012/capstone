"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Minimize2, Maximize2, RotateCcw } from 'lucide-react'

interface VideoMinimapProps {
  videoRef: React.RefObject<HTMLVideoElement>
  currentTime: number
  duration: number
  timeMarkers: number[]
  onSeek: (time: number) => void
}

export default function VideoMinimap({ videoRef, currentTime, duration, timeMarkers, onSeek }: VideoMinimapProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [thumbnails, setThumbnails] = useState<string[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const minimapRef = useRef<HTMLDivElement>(null)

  // 모바일 감지 훅 추가
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
        userAgent.toLowerCase(),
      )
      const isSmallScreen = window.innerWidth <= 768
      setIsMobile(isMobileDevice || isSmallScreen)
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // 썸네일 생성
  useEffect(() => {
    if (videoRef.current && duration > 0) {
      generateThumbnails()
    }
  }, [videoRef.current, duration])

  const generateThumbnails = async () => {
    if (!videoRef.current || !canvasRef.current || duration <= 0) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    try {
      // 모바일에서는 더 작은 캔버스 사용
      canvas.width = isMobile ? 80 : 160
      canvas.height = isMobile ? 45 : 90

      const thumbnailCount = isMobile ? 6 : 10 // 모바일에서는 적은 수의 썸네일
      const newThumbnails: string[] = []

      // 비디오가 준비되었는지 확인
      if (video.readyState < 2) {
        await new Promise((resolve) => {
          video.addEventListener("loadeddata", resolve, { once: true })
        })
      }

      for (let i = 0; i < thumbnailCount; i++) {
        const time = (duration / thumbnailCount) * i

        // 모바일에서는 더 긴 대기 시간
        const seekTimeout = isMobile ? 1000 : 500

        try {
          // 비디오 시간 설정
          video.currentTime = time

          // seeked 이벤트 대기 (타임아웃 포함)
          await Promise.race([
            new Promise((resolve) => {
              video.addEventListener("seeked", resolve, { once: true })
            }),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error("Seek timeout")), seekTimeout)
            }),
          ])

          // 추가 대기 시간 (모바일에서 비디오 프레임 안정화)
          if (isMobile) {
            await new Promise((resolve) => setTimeout(resolve, 100))
          }

          // 캔버스에 비디오 프레임 그리기
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

          // 썸네일 데이터 URL 생성 (모바일에서는 낮은 품질)
          const quality = isMobile ? 0.5 : 0.7
          const thumbnailUrl = canvas.toDataURL("image/jpeg", quality)
          newThumbnails.push(thumbnailUrl)
        } catch (error) {
          console.warn(`Failed to generate thumbnail ${i}:`, error)
          // 실패한 경우 플레이스홀더 추가
          newThumbnails.push("/placeholder.svg?height=45&width=80")
        }
      }

      setThumbnails(newThumbnails)
    } catch (error) {
      console.error("Thumbnail generation failed:", error)
      // 전체 실패 시 플레이스홀더 배열 생성
      const fallbackThumbnails = Array(isMobile ? 6 : 10).fill("/placeholder.svg?height=45&width=80")
      setThumbnails(fallbackThumbnails)
    }
  }

  const handleMinimapClick = (e: React.MouseEvent) => {
    if (!minimapRef.current) return

    const rect = minimapRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percentage = clickX / rect.width
    const seekTime = percentage * duration

    onSeek(seekTime)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <>
      {/* 숨겨진 캔버스 (썸네일 생성용) */}
      <canvas ref={canvasRef} className="hidden" />

      {/* 미니맵 */}
      <div
        className={`fixed z-40 transition-all duration-300 ${
          isMobile
            ? isExpanded
              ? "bottom-2 right-2 w-72 h-48"
              : "bottom-2 right-2 w-40 h-24"
            : isExpanded
              ? "bottom-4 right-4 w-96 h-64"
              : "bottom-4 right-4 w-48 h-32"
        }`}
      >
        <Card className="bg-[#242a38] border border-[#2a3142] shadow-2xl h-full">
          <CardContent className="p-3 h-full flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white">비디오 미니맵</h3>
              <div className="flex gap-1">
                {/* 썸네일 생성 재시도 버튼 */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-gray-400 hover:text-[#00e6b4]"
                  onClick={() => {
                    setThumbnails([]) // 기존 썸네일 초기화
                    generateThumbnails()
                  }}
                  title="썸네일 다시 생성"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-gray-400 hover:text-[#00e6b4]"
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                </Button>
              </div>
            </div>

            {/* 썸네일 그리드 */}
            <div className="flex-1 overflow-hidden">
              {thumbnails.length > 0 ? (
                <div
                  className={`grid gap-1 h-full ${
                    isExpanded
                      ? isMobile
                        ? "grid-cols-3 grid-rows-2"
                        : "grid-cols-5 grid-rows-2"
                      : isMobile
                        ? "grid-cols-2 grid-rows-3"
                        : "grid-cols-3 grid-rows-2"
                  }`}
                >
                  {thumbnails.map((thumbnail, index) => {
                    const thumbnailTime = (duration / thumbnails.length) * index
                    const isActive = Math.abs(currentTime - thumbnailTime) < duration / thumbnails.length / 2

                    return (
                      <div
                        key={index}
                        className={`relative cursor-pointer rounded overflow-hidden border-2 transition-all ${
                          isActive ? "border-[#00e6b4] scale-105" : "border-transparent hover:border-[#3694ff]"
                        }`}
                        onClick={() => onSeek(thumbnailTime)}
                      >
                        {thumbnail.includes("placeholder") ? (
                          <div className="w-full h-full bg-[#1a1f2c] flex items-center justify-center">
                            <div className="text-xs text-gray-500">썸네일</div>
                          </div>
                        ) : (
                          <img
                            src={thumbnail || "/placeholder.svg"}
                            alt={`Thumbnail ${index + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // 이미지 로드 실패 시 플레이스홀더로 교체
                              ;(e.target as HTMLImageElement).src = "/placeholder.svg?height=45&width=80"
                            }}
                          />
                        )}

                        {/* 시간 표시 - 모바일에서 더 작게 */}
                        <div
                          className={`absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white px-1 py-0.5 ${
                            isMobile ? "text-xs" : "text-xs"
                          }`}
                        >
                          {formatTime(thumbnailTime)}
                        </div>

                        {/* 마커 표시 */}
                        {timeMarkers.some(
                          (marker) => Math.abs(marker - thumbnailTime) < duration / thumbnails.length / 2,
                        ) && <div className="absolute top-1 right-1 w-2 h-2 bg-[#6c5ce7] rounded-full"></div>}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 text-xs">
                  {isMobile ? "썸네일 로딩..." : "썸네일 생성 중..."}
                </div>
              )}
            </div>

            {/* 진행 바 */}
            <div
              ref={minimapRef}
              className="mt-2 h-2 bg-[#1a1f2c] rounded-full cursor-pointer relative overflow-hidden"
              onClick={handleMinimapClick}
            >
              {/* 전체 진행 바 */}
              <div
                className="absolute top-0 left-0 h-full bg-[#00e6b4] opacity-30 transition-all"
                style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
              />

              {/* 현재 위치 표시 */}
              <div
                className="absolute top-0 h-full w-1 bg-[#00e6b4] transition-all"
                style={{ left: `${(currentTime / (duration || 1)) * 100}%` }}
              />

              {/* 마커들 */}
              {timeMarkers.map((time, index) => (
                <div
                  key={index}
                  className="absolute top-0 h-full w-0.5 bg-[#6c5ce7]"
                  style={{ left: `${(time / (duration || 1)) * 100}%` }}
                />
              ))}
            </div>

            {/* 시간 정보 */}
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
