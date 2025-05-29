"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Play, Pause, SkipForward, SkipBack, ArrowLeft, Video, X } from 'lucide-react'
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import DynamicHistorySidebar from "@/components/dynamic-history-sidebar"
import DraggableTooltip from "@/components/draggable-tooltip"
import ToastNotification, { type Toast } from "@/components/toast-notification"
import VideoMinimap from "@/components/video-minimap"
import type { ChatSession } from "@/app/types/session"
import { getUploadedVideos } from "@/app/actions/video-service"
import type { UploadedVideo } from "@/app/types/video"
import Link from "next/link"
import { useParams } from "next/navigation"
import SmartHeader from "@/components/smart-header"

export default function VideoDetailPage() {
  const params = useParams()
  const videoId = params.videoId as string

  const [video, setVideo] = useState<UploadedVideo | null>(null)
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string; timestamp?: number }[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [timeMarkers, setTimeMarkers] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // UI 상태
  const [historyOpen, setHistoryOpen] = useState(false)
  const [tooltipData, setTooltipData] = useState<{ title: string; content: string; timestamp?: number } | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [isMobile, setIsMobile] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    if (videoId) {
      loadVideoData()
    }
  }, [videoId])

  const loadVideoData = async () => {
    setLoading(true)
    try {
      // 비디오 정보 로드
      const videosResponse = await getUploadedVideos()
      if (videosResponse.success) {
        const foundVideo = videosResponse.data.find((v) => v.id === videoId)
        if (foundVideo) {
          setVideo(foundVideo)
          setVideoSrc(foundVideo.filePath)
          setDuration(foundVideo.duration)

          // 새로운 분석 세션 시작 - 기존 세션을 로드하지 않고 새 메시지로 시작
          setMessages([
            {
              role: "assistant",
              content: `"${foundVideo.originalName}" 영상이 로드되었습니다. 영상 내용에 대해 질문해보세요.`,
            },
          ])
          setTimeMarkers([]) // 타임마커 초기화
          setCurrentSession(null) // 현재 세션 초기화
        }
      }
    } catch (error) {
      console.error("Failed to load video data:", error)
      addToast({
        type: "error",
        title: "로드 실패",
        message: "비디오 데이터를 불러오는 중 오류가 발생했습니다.",
        duration: 3000,
      })
    } finally {
      setLoading(false)
    }
  }

  const addToast = (toast: Omit<Toast, "id">) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    setToasts((prev) => [...prev, { ...toast, id }])
  }

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const skipForward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime += 10
    }
  }

  const skipBackward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime -= 10
    }
  }

  const seekToTime = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inputMessage.trim()) {
      const userMessage = inputMessage

      setMessages((prev) => [...prev, { role: "user", content: userMessage }])

      addToast({
        type: "info",
        title: "분석 중",
        message: "AI가 영상을 분석하고 있습니다...",
        duration: 2000,
      })

      setTimeout(() => {
        const randomTimestamp = Math.random() * (duration || 60)
        setTimeMarkers((prev) => [...prev, randomTimestamp])

        const assistantMessage = {
          role: "assistant" as const,
          content: `영상 내용을 분석했습니다. ${formatTime(randomTimestamp)} 시점에서 관련 정보를 찾았습니다.`,
          timestamp: randomTimestamp,
        }

        setMessages((prev) => [...prev, assistantMessage])

        addToast({
          type: "success",
          title: "분석 완료",
          message: "AI 분석이 완료되었습니다.",
          duration: 3000,
        })
      }, 1000)

      setInputMessage("")
    }
  }

  const handleSelectSession = (session: any) => {
    setCurrentSession(session)
    setMessages(session.messages)

    const timestamps = session.messages.filter((msg: any) => msg.timestamp).map((msg: any) => msg.timestamp!)
    setTimeMarkers(timestamps)

    setHistoryOpen(false)

    addToast({
      type: "info",
      title: "세션 로드",
      message: `"${session.title}" 세션을 불러왔습니다.`,
      duration: 2000,
    })
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const updateTime = () => setCurrentTime(video.currentTime)
    const updateDuration = () => setDuration(video.duration)

    video.addEventListener("timeupdate", updateTime)
    video.addEventListener("loadedmetadata", updateDuration)

    return () => {
      video.removeEventListener("timeupdate", updateTime)
      video.removeEventListener("loadedmetadata", updateDuration)
    }
  }, [videoSrc])

  // 모바일에서 히스토리 열릴 때 body 스크롤 방지
  useEffect(() => {
    // 클라이언트에서만 실행
    if (typeof window === 'undefined') return

    if (isMobile && historyOpen) {
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
    } else {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
    }

    return () => {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
    }
  }, [isMobile, historyOpen])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1f2c] text-gray-100 flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="w-16 h-16 bg-[#00e6b4] rounded-full mx-auto mb-4 animate-bounce"></div>
          <p className="text-white text-lg">비디오 로딩 중...</p>
        </div>
      </div>
    )
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-[#1a1f2c] text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">비디오를 찾을 수 없습니다</h1>
          <Link href="/uploaded_video">
            <Button className="bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c]">
              <ArrowLeft className="h-4 w-4 mr-2" />
              비디오 목록으로 돌아가기
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a1f2c] text-gray-100 flex flex-col">
      {/* Smart Header */}
      <SmartHeader
        currentPage="video_detail"
        historyOpen={historyOpen}
        onHistoryToggle={() => setHistoryOpen(!historyOpen)}
        mobileMenuOpen={mobileMenuOpen}
        onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
      />

      {/* Main Layout - 헤더 높이만큼 패딩 추가 */}
      <div className="flex flex-1 overflow-hidden relative pt-20">
        {/* Main Content */}
        <main
          className={`flex-1 w-full min-w-0 py-4 md:py-8 px-2 md:px-4 overflow-auto transition-all duration-300 ${
            historyOpen && !isMobile ? "blur-sm scale-95 opacity-75" : "blur-0 scale-100 opacity-100"
          }`}
        >
          <div className="w-full max-w-7xl mx-auto">
            <div className="flex flex-col lg:grid lg:grid-cols-3 gap-3 md:gap-6">
              <div className="lg:col-span-2 min-w-0 order-1 lg:order-1">
                <Card className="mb-3 md:mb-6 bg-[#242a38] border-0 shadow-lg">
                  <CardContent className="p-2 md:p-6">
                    {videoSrc ? (
                      <div className="relative">
                        <video
                          ref={videoRef}
                          className="w-full h-auto rounded-md bg-black"
                          src={videoSrc}
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-[400px] rounded-lg bg-[#2a3142]">
                        <Video className="h-16 w-16 text-gray-500 mb-4" />
                        <p className="text-gray-400">비디오를 로드할 수 없습니다</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {videoSrc && (
                  <Card className="bg-[#242a38] border-0 shadow-lg">
                    <CardContent className="p-3 md:p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">{formatTime(currentTime)}</span>
                        <div className="flex items-center gap-1 md:gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="border-[#2a3142] text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4] h-9 w-9 md:h-10 md:w-10"
                            onClick={skipBackward}
                          >
                            <SkipBack className="h-3 w-3 md:h-4 md:w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="border-[#2a3142] text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4] h-9 w-9 md:h-10 md:w-10"
                            onClick={togglePlayPause}
                          >
                            {isPlaying ? (
                              <Pause className="h-3 w-3 md:h-4 md:w-4" />
                            ) : (
                              <Play className="h-3 w-3 md:h-4 md:w-4" />
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="border-[#2a3142] text-gray-300 hover:text-[#00e6b4] hover:border-[#00e6b4] h-9 w-9 md:h-10 md:w-10"
                            onClick={skipForward}
                          >
                            <SkipForward className="h-3 w-3 md:h-4 md:w-4" />
                          </Button>
                        </div>
                        <span className="text-gray-400 text-sm">{formatTime(duration)}</span>
                      </div>

                      <div className="relative w-full h-6 md:h-8 bg-[#1a1f2c] rounded-full overflow-hidden cursor-pointer">
                        <div
                          className="absolute top-0 left-0 h-full bg-[#00e6b4] opacity-30"
                          style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                        />

                        {timeMarkers.map((time, index) => (
                          <div
                            key={index}
                            className="absolute top-0 h-full w-1 bg-[#6c5ce7] cursor-pointer"
                            style={{ left: `${(time / (duration || 1)) * 100}%` }}
                            onClick={() => seekToTime(time)}
                            title={`${formatTime(time)}로 이동`}
                          />
                        ))}

                        <div
                          className="absolute top-0 left-0 w-full h-full"
                          onClick={(e) => {
                            if (videoRef.current) {
                              const rect = e.currentTarget.getBoundingClientRect()
                              const pos = (e.clientX - rect.left) / rect.width
                              videoRef.current.currentTime = pos * (duration || 0)
                            }
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="order-2 lg:order-2">
                <Card className="h-[60vh] lg:h-full bg-[#242a38] border-0 shadow-lg">
                  <CardContent className="p-2 md:p-4 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-2 md:mb-4">
                      <div>
                        <h2 className="text-base md:text-xl font-semibold text-white">새 분석 세션</h2>
                        <p className="text-xs md:text-sm text-gray-400 break-words">
                          {video?.originalName} 영상에 대한 새로운 분석을 시작합니다
                        </p>
                      </div>
                    </div>

                    <div className="flex-1 overflow-hidden mb-2 md:mb-4 border border-[#2a3142] rounded-md">
                      <ScrollArea className="h-[35vh] lg:h-[400px] pr-1 md:pr-2">
                        <div className="space-y-2 md:space-y-4 p-2 md:p-4">
                          {messages.map((message, index) => (
                            <div
                              key={index}
                              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                              <div
                                className={`max-w-[90%] md:max-w-[80%] rounded-lg p-2 md:p-3 text-xs md:text-base break-words ${
                                  message.role === "user" ? "bg-[#6c5ce7] text-white" : "bg-[#2a3142] text-gray-200"
                                }`}
                              >
                                {message.content}
                                {message.timestamp && (
                                  <button
                                    onClick={() => seekToTime(message.timestamp || 0)}
                                    className="mt-2 text-xs md:text-sm font-medium text-[#00e6b4] hover:underline block"
                                  >
                                    {formatTime(message.timestamp)}로 이동
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>

                    <Separator className="my-3 md:my-4 bg-[#2a3142]" />

                    <form onSubmit={handleSendMessage} className="flex gap-1 md:gap-2">
                      <Textarea
                        placeholder="영상 내용에 대해 질문하세요..."
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        className="flex-1 resize-none border-[#2a3142] text-gray-200 placeholder:text-gray-500 text-sm md:text-base bg-[#1a1f2c] hover:border-[#00e6b4] focus:border-[#00e6b4]"
                        rows={3}
                      />
                      <Button
                        type="submit"
                        disabled={!inputMessage.trim()}
                        className={`px-3 md:px-4 text-sm md:text-sm transition-all duration-200 ${
                          !inputMessage.trim()
                            ? "bg-gray-600 text-gray-400 cursor-not-allowed opacity-50"
                            : "bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c]"
                        }`}
                      >
                        전송
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>

        {/* Session History Sidebar - 모바일에서는 전체 화면으로 */}
        {isMobile ? (
          <div
            className={`fixed inset-0 z-50 bg-[#1a1f2c] transform transition-transform duration-300 ease-out ${
              historyOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            {/* 모바일 전용 헤더 */}
            <div className="bg-[#242a38] border-b border-[#2a3142] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center">
                  <img
                    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Adobe%20Express%20-%20file-z6kXCSxAQt4ISVmQRZCDhYxUILirrx.png"
                    alt="Deep Sentinel Logo"
                    className="w-full h-full object-contain scale-[1.7]"
                  />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white">Deep Sentinel</h1>
                  <span className="text-xs text-gray-400">분석 히스토리</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-gray-400 hover:text-white hover:bg-[#1a1f2c]"
                onClick={() => setHistoryOpen(false)}
              >
                <X className="h-6 w-6" />
              </Button>
            </div>

            <div className="flex-1 h-[calc(100vh-80px)] overflow-hidden">
              <DynamicHistorySidebar
                onSelectHistory={handleSelectSession}
                currentHistoryId={currentSession?.id}
                onClose={() => setHistoryOpen(false)}
              />
            </div>
          </div>
        ) : (
          <div
            className={`fixed inset-y-0 right-0 z-50 transform transition-transform duration-300 ease-in-out ${
              historyOpen ? "translate-x-0" : "translate-x-full"
            } w-80 max-w-sm`}
            style={{
              top: "73px",
              height: "calc(100vh - 73px)",
            }}
          >
            <DynamicHistorySidebar
              onSelectHistory={handleSelectSession}
              currentHistoryId={currentSession?.id}
              onClose={() => setHistoryOpen(false)}
            />
          </div>
        )}

        {historyOpen && !isMobile && (
          <div
            className="fixed inset-0 z-40 backdrop-blur-sm bg-gradient-to-r from-[#1a1f2c]/20 via-[#00e6b4]/5 to-[#3694ff]/10"
            style={{
              top: "73px",
              height: "calc(100vh - 73px)",
            }}
            onClick={() => setHistoryOpen(false)}
          />
        )}
      </div>

      {/* Components */}
      <DraggableTooltip data={tooltipData} onClose={() => setTooltipData(null)} />
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      {videoSrc && (
        <VideoMinimap
          videoRef={videoRef}
          currentTime={currentTime}
          duration={duration}
          timeMarkers={timeMarkers}
          onSeek={seekToTime}
        />
      )}
    </div>
  )
}
