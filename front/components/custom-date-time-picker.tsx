"use client"

import React, { useState, useEffect } from "react"
import { Calendar, Clock, ChevronLeft, ChevronRight, X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday } from "date-fns"
import { ko } from "date-fns/locale"

interface CustomDateTimePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function CustomDateTimePicker({ value, onChange, placeholder = "날짜와 시간을 선택하세요" }: CustomDateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(value ? new Date(value) : null)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  
  // 서울 시간 기준으로 초기값 설정
  const getSeoulTime = () => {
    const now = new Date()
    return new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}))
  }
  
  const seoulNow = getSeoulTime()
  const [selectedHour, setSelectedHour] = useState(selectedDate?.getHours() || seoulNow.getHours())
  const [selectedMinute, setSelectedMinute] = useState(selectedDate?.getMinutes() || seoulNow.getMinutes())
  const [isMobile, setIsMobile] = useState(false)

  // 모바일 감지
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 현재 값이 변경되면 내부 상태 업데이트
  useEffect(() => {
    if (value) {
      const date = new Date(value)
      setSelectedDate(date)
      setCurrentMonth(date)
      setSelectedHour(date.getHours())
      setSelectedMinute(date.getMinutes())
    }
  }, [value])

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // 달력의 첫 주가 월요일부터 시작하도록 빈 칸 계산
  const startDate = new Date(monthStart)
  const firstDayOfWeek = startDate.getDay()
  const emptyDays = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1

  const handleDateSelect = (date: Date) => {
    const newDate = new Date(date)
    newDate.setHours(selectedHour)
    newDate.setMinutes(selectedMinute)
    setSelectedDate(newDate)
    
    // ISO 문자열로 변환하여 onChange 호출
    const isoString = newDate.toISOString().slice(0, 16)
    onChange(isoString)
  }

  const handleTimeChange = (hour: number, minute: number) => {
    setSelectedHour(hour)
    setSelectedMinute(minute)
    
    if (selectedDate) {
      const newDate = new Date(selectedDate)
      newDate.setHours(hour)
      newDate.setMinutes(minute)
      setSelectedDate(newDate)
      
      const isoString = newDate.toISOString().slice(0, 16)
      onChange(isoString)
    }
  }

  const handleCurrentTime = () => {
    // 서울 시간 기준으로 현재 시간 설정
    const now = new Date()
    const seoulTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}))
    
    setSelectedDate(seoulTime)
    setCurrentMonth(seoulTime)
    setSelectedHour(seoulTime.getHours())
    setSelectedMinute(seoulTime.getMinutes())
    
    const isoString = seoulTime.toISOString().slice(0, 16)
    onChange(isoString)
    setIsOpen(false)
  }

  const handleConfirm = () => {
    setIsOpen(false)
  }

  const formatDisplayValue = () => {
    if (!selectedDate) return placeholder
    return format(selectedDate, "yyyy년 MM월 dd일 HH:mm", { locale: ko })
  }

  // 모바일 풀스크린 모달 렌더링
  const renderMobileModal = () => (
    <div className="fixed inset-0 z-50 bg-[#1a1f2c]">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-[#242a38] border-b border-[#2a3142] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">날짜와 시간 선택</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-400 hover:text-white"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* 컨텐츠 */}
      <div className="p-6 pb-24 overflow-y-auto h-full">
        {/* 달력 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-gray-400 hover:text-white hover:bg-[#242a38] transition-all duration-200"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <select
                value={currentMonth.getFullYear()}
                onChange={(e) => {
                  const newYear = parseInt(e.target.value)
                  const newDate = new Date(currentMonth)
                  newDate.setFullYear(newYear)
                  setCurrentMonth(newDate)
                }}
                className="px-2 py-1 bg-[#242a38] border border-[#2a3142] rounded-md text-white text-sm font-bold focus:border-[#00e6b4] focus:outline-none"
              >
                {Array.from({ length: 21 }, (_, i) => {
                  const year = new Date().getFullYear() - 10 + i
                  return (
                    <option key={year} value={year}>
                      {year}년
                    </option>
                  )
                })}
              </select>
              
              <select
                value={currentMonth.getMonth()}
                onChange={(e) => {
                  const newMonth = parseInt(e.target.value)
                  const newDate = new Date(currentMonth)
                  newDate.setMonth(newMonth)
                  setCurrentMonth(newDate)
                }}
                className="px-2 py-1 bg-[#242a38] border border-[#2a3142] rounded-md text-white text-sm font-bold focus:border-[#00e6b4] focus:outline-none"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i}>
                    {i + 1}월
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-gray-400 hover:text-white hover:bg-[#242a38] transition-all duration-200"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 gap-2 mb-4">
          {["월", "화", "수", "목", "금", "토", "일"].map((day, index) => (
            <div key={day} className="h-10 flex items-center justify-center">
              <span className={`text-sm font-semibold ${index === 6 ? 'text-red-400' : index === 5 ? 'text-blue-400' : 'text-gray-400'}`}>
                {day}
              </span>
            </div>
          ))}
        </div>

        {/* 달력 그리드 - 모바일 최적화 */}
        <div className="grid grid-cols-7 gap-2 mb-8">
          {/* 빈 칸들 */}
          {Array.from({ length: emptyDays }).map((_, index) => (
            <div key={`empty-${index}`} className="h-12" />
          ))}
          
          {/* 실제 날짜들 */}
          {days.map((day) => {
            const isSelected = selectedDate && isSameDay(day, selectedDate)
            const isCurrentDay = isToday(day)
            const isCurrentMonthDay = isSameMonth(day, currentMonth)

            return (
              <Button
                key={day.toISOString()}
                variant="ghost"
                className={`h-12 w-full p-0 text-base font-medium transition-all duration-200 ${
                  isSelected
                    ? "bg-[#00e6b4] text-[#1a1f2c] hover:bg-[#00c49c] shadow-lg scale-105"
                    : isCurrentDay
                    ? "bg-[#6c5ce7] text-white hover:bg-[#a29bfe] shadow-md"
                    : isCurrentMonthDay
                    ? "text-white hover:bg-[#242a38] hover:text-[#00e6b4]"
                    : "text-gray-600 hover:bg-[#242a38] hover:text-gray-400"
                }`}
                onClick={() => handleDateSelect(day)}
              >
                {format(day, "d")}
              </Button>
            )
          })}
        </div>

        {/* 시간 선택 섹션 */}
        <div className="bg-[#242a38] rounded-lg p-6 mb-6">
          <h4 className="text-lg font-semibold text-white mb-4 text-center">시간 선택</h4>
          
          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <label className="block text-sm font-medium text-gray-400 mb-3">시간</label>
              <select
                value={selectedHour}
                onChange={(e) => handleTimeChange(Number(e.target.value), selectedMinute)}
                className="w-20 h-12 px-2 bg-[#1a1f2c] border border-[#2a3142] rounded-lg text-white text-center text-lg font-bold focus:border-[#00e6b4] focus:outline-none"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {i.toString().padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="text-3xl text-[#00e6b4] font-bold mt-6">:</div>
            
            <div className="text-center">
              <label className="block text-sm font-medium text-gray-400 mb-3">분</label>
              <select
                value={selectedMinute}
                onChange={(e) => handleTimeChange(selectedHour, Number(e.target.value))}
                className="w-20 h-12 px-2 bg-[#1a1f2c] border border-[#2a3142] rounded-lg text-white text-center text-lg font-bold focus:border-[#00e6b4] focus:outline-none"
              >
                {Array.from({ length: 60 }, (_, i) => (
                  <option key={i} value={i}>
                    {i.toString().padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 현재 시간 버튼 */}
          <Button
            onClick={handleCurrentTime}
            className="w-full mt-6 bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] hover:from-[#a29bfe] hover:to-[#6c5ce7] text-white font-semibold h-12"
          >
            <Clock className="mr-2 h-5 w-5" />
            현재 시간으로 설정
          </Button>
        </div>
      </div>

      {/* 하단 고정 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#242a38] border-t border-[#2a3142]">
        <Button
          onClick={handleConfirm}
          disabled={!selectedDate}
          className="w-full h-14 bg-gradient-to-r from-[#00e6b4] to-[#00c49c] hover:from-[#00c49c] hover:to-[#00a885] text-[#1a1f2c] text-lg font-bold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check className="mr-2 h-6 w-6" />
          {selectedDate ? `${formatDisplayValue()} 선택` : "날짜를 선택하세요"}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="relative w-full">
      {/* 메인 입력 버튼 */}
      <Button
        variant="outline"
        className={`w-full justify-start text-left font-normal h-12 px-4 bg-[#1a1f2c] border-[#2a3142] text-white hover:border-[#00e6b4] hover:bg-[#242a38] transition-all duration-200 ${
          selectedDate ? "text-white" : "text-gray-400"
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Calendar className="mr-3 h-4 w-4 text-[#00e6b4]" />
        <span className="flex-1">{formatDisplayValue()}</span>
        <Clock className="ml-2 h-4 w-4 text-[#00e6b4]" />
      </Button>

      {/* 모바일용 풀스크린 모달 */}
      {isMobile && isOpen && renderMobileModal()}

      {/* 데스크톱용 드롭다운 달력 */}
      {!isMobile && isOpen && (
        <div className="absolute top-full left-0 z-50 mt-2 w-full animate-in slide-in-from-top-2 duration-200">
          <Card className="border-[#2a3142] bg-[#242a38] shadow-2xl overflow-hidden">
            <CardContent className="p-4">
              {/* 달력 헤더 */}
              <div className="flex items-center justify-between mb-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-white hover:bg-[#1a1f2c] transition-all duration-200 hover:scale-110"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <div className="flex items-center gap-2">
                  <select
                    value={currentMonth.getFullYear()}
                    onChange={(e) => {
                      const newYear = parseInt(e.target.value)
                      const newDate = new Date(currentMonth)
                      newDate.setFullYear(newYear)
                      setCurrentMonth(newDate)
                    }}
                    className="px-2 py-1 bg-[#1a1f2c] border border-[#2a3142] rounded-md text-white text-sm font-semibold focus:border-[#00e6b4] focus:outline-none"
                  >
                    {Array.from({ length: 21 }, (_, i) => {
                      const year = new Date().getFullYear() - 10 + i
                      return (
                        <option key={year} value={year}>
                          {year}년
                        </option>
                      )
                    })}
                  </select>
                  
                  <select
                    value={currentMonth.getMonth()}
                    onChange={(e) => {
                      const newMonth = parseInt(e.target.value)
                      const newDate = new Date(currentMonth)
                      newDate.setMonth(newMonth)
                      setCurrentMonth(newDate)
                    }}
                    className="px-2 py-1 bg-[#1a1f2c] border border-[#2a3142] rounded-md text-white text-sm font-semibold focus:border-[#00e6b4] focus:outline-none"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i}>
                        {i + 1}월
                      </option>
                    ))}
                  </select>
                </div>
                
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-white hover:bg-[#1a1f2c] transition-all duration-200 hover:scale-110"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* 요일 헤더 */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {["월", "화", "수", "목", "금", "토", "일"].map((day, index) => (
                  <div key={day} className="h-8 flex items-center justify-center">
                    <span className={`text-xs font-medium ${index === 6 ? 'text-red-400' : index === 5 ? 'text-blue-400' : 'text-gray-400'}`}>
                      {day}
                    </span>
                  </div>
                ))}
              </div>

              {/* 달력 그리드 */}
              <div className="grid grid-cols-7 gap-1">
                {/* 빈 칸들 */}
                {Array.from({ length: emptyDays }).map((_, index) => (
                  <div key={`empty-${index}`} className="h-8" />
                ))}
                
                {/* 실제 날짜들 */}
                {days.map((day) => {
                  const isSelected = selectedDate && isSameDay(day, selectedDate)
                  const isCurrentDay = isToday(day)
                  const isCurrentMonth = isSameMonth(day, currentMonth)

                  return (
                    <Button
                      key={day.toISOString()}
                      variant="ghost"
                      className={`h-8 w-8 p-0 text-sm font-medium transition-all duration-200 hover:scale-110 ${
                        isSelected
                          ? "bg-[#00e6b4] text-[#1a1f2c] hover:bg-[#00c49c] shadow-lg scale-105"
                          : isCurrentDay
                          ? "bg-[#6c5ce7] text-white hover:bg-[#a29bfe] shadow-md"
                          : isCurrentMonth
                          ? "text-white hover:bg-[#1a1f2c] hover:text-[#00e6b4]"
                          : "text-gray-600 hover:bg-[#1a1f2c] hover:text-gray-400"
                      }`}
                      onClick={() => handleDateSelect(day)}
                    >
                      {format(day, "d")}
                    </Button>
                  )
                })}
              </div>

              {/* 시간 선택 */}
              <div className="mt-4 pt-4 border-t border-[#2a3142]">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-400 mb-2">시간</label>
                    <select
                      value={selectedHour}
                      onChange={(e) => handleTimeChange(Number(e.target.value), selectedMinute)}
                      className="w-full h-10 px-3 bg-[#1a1f2c] border border-[#2a3142] rounded-md text-white focus:border-[#00e6b4] focus:outline-none transition-colors duration-200"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>
                          {i.toString().padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="text-2xl text-[#00e6b4] font-bold mt-6">:</div>
                  
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-400 mb-2">분</label>
                    <select
                      value={selectedMinute}
                      onChange={(e) => handleTimeChange(selectedHour, Number(e.target.value))}
                      className="w-full h-10 px-3 bg-[#1a1f2c] border border-[#2a3142] rounded-md text-white focus:border-[#00e6b4] focus:outline-none transition-colors duration-200"
                    >
                      {Array.from({ length: 60 }, (_, i) => (
                        <option key={i} value={i}>
                          {i.toString().padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 액션 버튼들 */}
              <div className="flex gap-2 mt-4">
                <Button
                  onClick={handleCurrentTime}
                  className="flex-1 bg-gradient-to-r from-[#00e6b4] to-[#00c49c] hover:from-[#00c49c] hover:to-[#00a885] text-[#1a1f2c] text-sm font-semibold transition-all duration-200 hover:scale-105 shadow-lg"
                >
                  <Clock className="mr-2 h-4 w-4" />
                  현재 시간
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                  className="flex-1 border-[#2a3142] text-gray-400 hover:text-white hover:bg-[#1a1f2c] text-sm transition-all duration-200 hover:scale-105"
                >
                  닫기
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 백드롭 (외부 클릭시 닫기) - 데스크톱 전용 */}
      {!isMobile && isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}