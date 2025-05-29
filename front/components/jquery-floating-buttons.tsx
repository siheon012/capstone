"use client"

import { useEffect, useRef } from "react"
import { Settings, HelpCircle, Zap, Star } from 'lucide-react'

declare global {
  interface Window {
    $: any
    jQuery: any
  }
}

export default function JQueryFloatingButtons() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // jQuery 안전 로딩 확인
    const initializeJQuery = () => {
      try {
        if (typeof window !== "undefined" && window.$ && containerRef.current) {
          const $ = window.$

          // 플로팅 버튼 컨테이너
          const $container = $(containerRef.current)

          // 기존 이벤트 제거
          $container.find("*").off()

          // 메인 버튼 클릭 시 서브 버튼들 토글
          $container.find(".main-floating-btn").on("click", function (e: any) {
            e.preventDefault()
            e.stopPropagation()

            const $subButtons = $container.find(".sub-floating-btn")
            const isOpen = $(this).hasClass("open")

            if (isOpen) {
              // 닫기 애니메이션
              $subButtons.each(function (index: number) {
                $(this)
                  .delay(index * 100)
                  .animate(
                    {
                      bottom: "20px",
                      opacity: 0,
                    },
                    300,
                  )
              })
              $(this).removeClass("open")
            } else {
              // 열기 애니메이션
              $subButtons.each(function (index: number) {
                $(this)
                  .delay(index * 100)
                  .animate(
                    {
                      bottom: 80 + index * 60 + "px",
                      opacity: 1,
                    },
                    400,
                  )
              })
              $(this).addClass("open")
            }
          })

          // 서브 버튼 호버 효과
          $container.find(".sub-floating-btn").on("mouseenter", function () {
            $(this).stop().animate({ scale: "1.1" }, 200)
          })

          $container.find(".sub-floating-btn").on("mouseleave", function () {
            $(this).stop().animate({ scale: "1" }, 200)
          })

          console.log("jQuery floating buttons initialized successfully")
        }
      } catch (error) {
        console.warn("jQuery floating buttons initialization failed:", error)
      }
    }

    // jQuery 로드 확인 후 초기화
    const checkJQuery = () => {
      if (typeof window !== "undefined" && window.$) {
        initializeJQuery()
      } else {
        // 재시도
        setTimeout(checkJQuery, 100)
      }
    }

    checkJQuery()

    // 클린업
    return () => {
      try {
        if (typeof window !== "undefined" && window.$ && containerRef.current) {
          const $ = window.$
          $(containerRef.current).find("*").off()
          $(containerRef.current).stop(true, true)
        }
      } catch (error) {
        console.warn("jQuery cleanup failed:", error)
      }
    }
  }, [])

  return (
    <div ref={containerRef} className="jquery-floating-container">
      {/* 메인 플로팅 버튼 */}
      <div className="main-floating-btn fixed bottom-6 right-6 w-14 h-14 bg-[#00e6b4] rounded-full shadow-2xl cursor-pointer z-50 flex items-center justify-center transition-all duration-300 hover:shadow-[#00e6b4]/50">
        <div className="icon text-[#1a1f2c] text-xl font-bold">+</div>
      </div>

      {/* 서브 플로팅 버튼들 */}
      <div className="sub-floating-btn fixed bottom-5 right-6 w-12 h-12 bg-[#3694ff] rounded-full shadow-xl cursor-pointer z-40 flex items-center justify-center opacity-0">
        <Settings className="h-5 w-5 text-white" />
      </div>

      <div className="sub-floating-btn fixed bottom-5 right-6 w-12 h-12 bg-[#ff6b6b] rounded-full shadow-xl cursor-pointer z-40 flex items-center justify-center opacity-0">
        <HelpCircle className="h-5 w-5 text-white" />
      </div>

      <div className="sub-floating-btn fixed bottom-5 right-6 w-12 h-12 bg-[#ffd93d] rounded-full shadow-xl cursor-pointer z-40 flex items-center justify-center opacity-0">
        <Zap className="h-5 w-5 text-[#1a1f2c]" />
      </div>

      <div className="sub-floating-btn fixed bottom-5 right-6 w-12 h-12 bg-[#6c5ce7] rounded-full shadow-xl cursor-pointer z-40 flex items-center justify-center opacity-0">
        <Star className="h-5 w-5 text-white" />
      </div>
    </div>
  )
}
