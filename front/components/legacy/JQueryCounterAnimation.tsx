"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"

declare global {
  interface Window {
    $: any
    jQuery: any
  }
}

interface CounterAnimationProps {
  stats: Array<{
    label: string
    value: number
    suffix?: string
    color: string
  }>
}

export default function JQueryCounterAnimation({ stats }: CounterAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [animationCompleted, setAnimationCompleted] = useState(false)
  const [hasBeenVisible, setHasBeenVisible] = useState(false)

  useEffect(() => {
    // 이미 애니메이션이 완료되었다면 실행하지 않음
    if (animationCompleted || hasBeenVisible) return

    const initializeCounters = () => {
      try {
        if (typeof window !== "undefined" && window.$ && containerRef.current) {
          const $ = window.$
          const $container = $(containerRef.current)

          // 기존 애니메이션 정리
          $container.find("*").stop(true, true)

          // 카운터 애니메이션 함수
          const animateCounter = ($element: any, targetValue: number, suffix = "") => {
            try {
              $({ countNum: 0 }).animate(
                { countNum: targetValue },
                {
                  duration: 2000,
                  easing: "swing", // jQuery 기본 easing 사용
                  step: function () {
                    $element.text(Math.floor(this.countNum).toLocaleString() + suffix)
                  },
                  complete: () => {
                    $element.text(targetValue.toLocaleString() + suffix)
                  },
                },
              )
            } catch (error) {
              console.warn("Counter animation error:", error)
              // 폴백: 즉시 최종 값 표시
              $element.text(targetValue.toLocaleString() + suffix)
            }
          }

          // Intersection Observer로 뷰포트 진입 시 애니메이션 시작 (한 번만)
          const observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting && !hasBeenVisible) {
                  setHasBeenVisible(true)

                  const $counters = $container.find(".counter-number")
                  let completedCount = 0
                  const totalCounters = $counters.length

                  $counters.each(function (index: number) {
                    const $this = $(this)
                    const targetValue = Number.parseInt($this.data("target"))
                    const suffix = $this.data("suffix") || ""

                    // 지연 시간을 두고 순차적으로 애니메이션
                    setTimeout(() => {
                      // 애니메이션 완료 콜백 추가
                      $({ countNum: 0 }).animate(
                        { countNum: targetValue },
                        {
                          duration: 2000,
                          easing: "swing",
                          step: function () {
                            $this.text(Math.floor(this.countNum).toLocaleString() + suffix)
                          },
                          complete: () => {
                            $this.text(targetValue.toLocaleString() + suffix)
                            completedCount++

                            // 모든 카운터 애니메이션이 완료되면 상태 업데이트
                            if (completedCount === totalCounters) {
                              setAnimationCompleted(true)
                            }
                          },
                        },
                      )
                    }, index * 200)
                  })

                  observer.unobserve(entry.target)
                }
              })
            },
            { threshold: 0.5 },
          )

          if (containerRef.current) {
            observer.observe(containerRef.current)
          }

          // 호버 효과 (jQuery) - 애니메이션 완료 후에만 적용
          if (animationCompleted) {
            $container.find(".counter-card").off("mouseenter mouseleave")
            $container.find(".counter-card").on("mouseenter", function () {
              $(this).stop().animate({ scale: "1.05" }, 200)
            })

            $container.find(".counter-card").on("mouseleave", function () {
              $(this).stop().animate({ scale: "1" }, 200)
            })
          }

          console.log("jQuery counters initialized successfully")

          return () => {
            try {
              observer.disconnect()
              $container.find("*").off()
              $container.find("*").stop(true, true)
            } catch (error) {
              console.warn("Counter cleanup error:", error)
            }
          }
        }
      } catch (error) {
        console.warn("Counter initialization failed:", error)
        return () => {}
      }
    }

    const checkJQuery = () => {
      if (typeof window !== "undefined" && window.$) {
        const cleanup = initializeCounters()
        return cleanup
      } else {
        setTimeout(checkJQuery, 100)
      }
    }

    const cleanup = checkJQuery()

    return () => {
      if (cleanup && typeof cleanup === "function") {
        cleanup()
      }
    }
  }, [animationCompleted, hasBeenVisible]) // stats 의존성 제거

  // 애니메이션이 완료되지 않았다면 초기값 표시
  useEffect(() => {
    if (animationCompleted && containerRef.current) {
      // 애니메이션 완료 후 최종 값들을 확실히 설정
      const counters = containerRef.current.querySelectorAll(".counter-number")
      counters.forEach((counter, index) => {
        const targetValue = stats[index]?.value || 0
        const suffix = stats[index]?.suffix || ""
        counter.textContent = targetValue.toLocaleString() + suffix
      })
    }
  }, [animationCompleted, stats])

  return (
    <div ref={containerRef} className="grid grid-cols-2 md:grid-cols-4 gap-4 my-8">
      {stats.map((stat, index) => (
        <Card key={index} className="counter-card bg-[#242a38] border-0 shadow-lg transition-transform">
          <CardContent className="p-6 text-center">
            <div
              className="counter-number text-3xl font-bold mb-2"
              style={{ color: stat.color }}
              data-target={stat.value}
              data-suffix={stat.suffix || ""}
            >
              {animationCompleted ? stat.value.toLocaleString() + (stat.suffix || "") : "0" + (stat.suffix || "")}
            </div>
            <div className="text-gray-400 text-sm">{stat.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
