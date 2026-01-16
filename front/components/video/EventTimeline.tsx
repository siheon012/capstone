import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Clock,
  Calendar,
  MapPin,
  User,
  Activity,
  RefreshCw,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Event } from '@/app/types/event';
import { UploadedVideo } from '@/app/types/video';
import { getEvents } from '@/app/actions/search/event-service';
import { formatAbsoluteTime, formatRelativeTime } from '@/app/types/event';

interface EventTimelineProps {
  video: UploadedVideo;
  currentTime?: number; // 현재 비디오 재생 시간
  onSeekToEvent?: (timestamp: number) => void; // 이벤트 시간으로 이동하는 콜백
}

export default function EventTimeline({
  video,
  currentTime = 0,
  onSeekToEvent,
}: EventTimelineProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);

  const loadEvents = async (forceRefresh: boolean = false) => {
    // video.id가 없는 경우 로딩 건너뛰기
    if (!video.id) {
      console.log('[EventTimeline] ⚠️ No video ID provided, skipping load');
      setLoading(false);
      return;
    }

    // 강제 새로고침이 아니고 이미 같은 비디오를 로드한 경우 건너뛰기 (중복 방지)
    if (!forceRefresh && currentVideoId === video.id) {
      console.log(
        `[EventTimeline] ℹ️ Events already loaded for video ${video.id}, skipping duplicate load`
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log(
        `[EventTimeline] 🔄 Loading events for video ID: ${video.id}`
      );
      console.log(`[EventTimeline] Video object:`, video);

      const response = await getEvents(video.id);

      console.log(`[EventTimeline] API response:`, response);

      if (response.success) {
        setEvents(response.data);
        setCurrentVideoId(video.id); // 현재 로드된 비디오 ID 저장
        console.log(
          `[EventTimeline] ✅ Loaded ${response.data.length} events for video ${video.id}`
        );
      } else {
        const errorMsg = response.error || '이벤트를 불러올 수 없습니다.';
        console.error(`[EventTimeline] API error:`, errorMsg);
        setError(errorMsg);
      }
    } catch (err) {
      console.error('[EventTimeline] Error loading events:', err);
      const errorMsg =
        err instanceof Error
          ? err.message
          : '이벤트를 불러오는 중 오류가 발생했습니다.';
      setError(`네트워크 오류: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // video.id가 변경되었을 때만 로드
    if (video.id && video.id !== currentVideoId) {
      console.log(
        `[EventTimeline] 🎬 Video ID changed from ${currentVideoId} to ${video.id}`
      );
      loadEvents();
    }
  }, [video.id]);

  const getEventTypeColor = (eventType: string) => {
    switch (eventType.toLowerCase()) {
      case 'theft':
        return 'bg-red-500 bg-opacity-20 text-red-400 border border-red-500 border-opacity-30';
      case 'collapse':
        return 'bg-yellow-500 bg-opacity-20 text-yellow-400 border border-yellow-500 border-opacity-30';
      case 'sitting':
        return 'bg-orange-500 bg-opacity-20 text-orange-400 border border-orange-500 border-opacity-30';
      default:
        return 'bg-blue-500 bg-opacity-20 text-blue-400 border border-blue-500 border-opacity-30';
    }
  };

  const translateEventType = (eventType: string) => {
    switch (eventType.toLowerCase()) {
      case 'theft':
        return '도난';
      case 'collapse':
        return '쓰러짐';
      case 'sitting':
        return '점거';
      default:
        return eventType;
    }
  };

  const isEventNearCurrentTime = (eventTimestamp: number) => {
    return Math.abs(eventTimestamp - currentTime) <= 5; // 5초 이내
  };

  if (loading) {
    return (
      <Card className="bg-[#242a38] border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Clock className="h-5 w-5" />
            이벤트 타임라인
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin text-[#00e6b4]" />
            <span className="ml-2 text-gray-400">이벤트를 불러오는 중...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-[#242a38] border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Clock className="h-5 w-5" />
            이벤트 타임라인
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <AlertTriangle className="h-6 w-6 text-red-400" />
            <span className="ml-2 text-red-400">{error}</span>
          </div>
          <div className="flex justify-center mt-4">
            <Button
              onClick={() => loadEvents(true)}
              variant="outline"
              className="border-[#00e6b4] text-[#00e6b4] hover:bg-[#00e6b4] hover:text-[#1a1f2c]"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              다시 시도
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#242a38] border-0 shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Clock className="h-5 w-5" />
            이벤트 타임라인
          </CardTitle>
          <Button
            onClick={() => loadEvents(true)}
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-[#00e6b4]"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm text-gray-400">
          총 {events.length}개의 이벤트가 감지되었습니다.
        </p>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <Info className="h-6 w-6 text-gray-400" />
            <span className="ml-2 text-gray-400">
              감지된 이벤트가 없습니다.
            </span>
          </div>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {events.map((event) => (
              <div
                key={event.id}
                className={`p-4 rounded-lg border transition-all duration-200 ${
                  isEventNearCurrentTime(event.timestamp)
                    ? 'border-[#00e6b4] bg-[#00e6b4] bg-opacity-10'
                    : 'border-[#2a3142] bg-[#1a1f2c] hover:border-[#3a4152]'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge className={getEventTypeColor(event.event_type)}>
                      {translateEventType(event.event_type)}
                    </Badge>
                    {onSeekToEvent && (
                      <Button
                        onClick={() => {
                          console.log(
                            `[EventTimeline] 이동 버튼 클릭 - timestamp: ${event.timestamp}`
                          );
                          console.log(
                            `[EventTimeline] onSeekToEvent function:`,
                            onSeekToEvent
                          );
                          onSeekToEvent(event.timestamp);
                        }}
                        variant="ghost"
                        size="sm"
                        className="text-[#00e6b4] hover:bg-[#00e6b4] hover:text-[#1a1f2c] h-6 px-2"
                      >
                        이동
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {/* 영상 내 시간 */}
                  <div className="flex items-center gap-2 text-gray-300">
                    <Clock className="h-4 w-4 text-[#6c5ce7]" />
                    <span className="font-medium">영상 시간:</span>
                    <span className="text-[#00e6b4]">
                      {formatRelativeTime(event.timestamp)}
                    </span>
                  </div>

                  {/* 실제 시각 */}
                  <div className="flex items-center gap-2 text-gray-300">
                    <Calendar className="h-4 w-4 text-[#6c5ce7]" />
                    <span className="font-medium">실제 시각:</span>
                    <span className="text-[#00e6b4]">
                      {event.absolute_time_display ||
                        (video.timeInVideo
                          ? formatAbsoluteTime(
                              video.timeInVideo,
                              event.timestamp
                            )
                          : '시간 정보 없음')}
                    </span>
                  </div>

                  {/* 위치 정보 */}
                  <div className="flex items-center gap-2 text-gray-300">
                    <MapPin className="h-4 w-4 text-[#6c5ce7]" />
                    <span className="font-medium">위치:</span>
                    <span>
                      {Number(event.location) === 1
                        ? 'left'
                        : Number(event.location) === 2
                        ? 'center'
                        : Number(event.location) === 3
                        ? 'right'
                        : event.location}
                    </span>
                  </div>

                  {/* 관심영역 */}
                  <div className="flex items-center gap-2 text-gray-300">
                    <MapPin className="h-4 w-4 text-[#6c5ce7]" />
                    <span className="font-medium">관심영역:</span>
                    <span>
                      {Number(event.area_of_interest) === 1
                        ? 'left'
                        : Number(event.area_of_interest) === 2
                        ? 'center'
                        : Number(event.area_of_interest) === 3
                        ? 'right'
                        : event.area_of_interest}
                    </span>
                  </div>

                  {/* 인물 정보 */}
                  <div className="flex items-center gap-2 text-gray-300">
                    <User className="h-4 w-4 text-[#6c5ce7]" />
                    <span className="font-medium">인물:</span>
                    <span>
                      {event.gender} ({event.age}세)
                    </span>
                  </div>

                  {/* 신뢰도 */}
                  <div className="flex items-center gap-2 text-gray-300">
                    <Activity className="h-4 w-4 text-[#6c5ce7]" />
                    <span className="font-medium">신뢰도:</span>
                    <span>
                      {event.confidence
                        ? `${(event.confidence * 100).toFixed(1)}%`
                        : '0%'}
                    </span>
                  </div>

                  {/* 행동 정보 */}
                  <div className="flex items-center gap-2 text-gray-300 md:col-span-2">
                    <Activity className="h-4 w-4 text-[#6c5ce7]" />
                    <span className="font-medium">이상 행동:</span>
                    <span>{event.action_detected}</span>
                  </div>

                  {/* 장면 분석 */}
                  {event.scene_analysis && (
                    <div className="text-gray-300 md:col-span-2">
                      <span className="font-medium">장면 분석:</span>
                      <p className="mt-1 text-gray-400">
                        {event.scene_analysis}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
