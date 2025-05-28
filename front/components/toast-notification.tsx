"use client"

import { useEffect, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, AlertCircle, XCircle, Info, X } from "lucide-react"

export type ToastType = "success" | "error" | "warning" | "info"

export interface Toast {
  id: string
  type: ToastType
  title: string
  message: string
  duration?: number
}

interface ToastNotificationProps {
  toasts: Toast[]
  onRemove: (id: string) => void
}

const toastIcons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
}

const toastColors = {
  success: "border-green-500 bg-green-500 bg-opacity-10",
  error: "border-red-500 bg-red-500 bg-opacity-10",
  warning: "border-yellow-500 bg-yellow-500 bg-opacity-10",
  info: "border-[#00e6b4] bg-[#00e6b4] bg-opacity-10",
}

const iconColors = {
  success: "text-green-500",
  error: "text-red-500",
  warning: "text-yellow-500",
  info: "text-[#00e6b4]",
}

export default function ToastNotification({ toasts, onRemove }: ToastNotificationProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // 순수 JavaScript DOM 조작 및 객체 사용
  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current

    // JavaScript 객체로 DOM 조작 기능들 정의
    const domManipulator = {
      // 1. 동적 요소 생성 및 추가
      addDynamicElement: (toastElement: HTMLElement, toastData: Toast) => {
        // 동적 배지 생성
        const badge = document.createElement("div")
        badge.className =
          "dynamic-badge absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
        badge.style.backgroundColor = toastData.type === "success" ? "#10b981" : "#3b82f6"
        badge.style.color = "white"
        badge.textContent = "!"

        // 요소에 추가
        toastElement.style.position = "relative"
        toastElement.appendChild(badge)

        // 3초 후 제거
        setTimeout(() => {
          if (badge.parentNode) {
            badge.remove()
          }
        }, 3000)
      },

      // 2. 클래스 토글 및 스타일 변경
      toggleInteractiveEffects: (toastElement: HTMLElement) => {
        // 호버 효과를 위한 이벤트 리스너 추가
        const handleMouseEnter = () => {
          toastElement.classList.add("toast-hover")
          toastElement.style.transform = "scale(1.02) translateX(-5px)"
          toastElement.style.boxShadow = "0 10px 25px rgba(0, 230, 180, 0.3)"
        }

        const handleMouseLeave = () => {
          toastElement.classList.remove("toast-hover")
          toastElement.style.transform = "scale(1) translateX(0)"
          toastElement.style.boxShadow = ""
        }

        // 이벤트 리스너 추가
        toastElement.addEventListener("mouseenter", handleMouseEnter)
        toastElement.addEventListener("mouseleave", handleMouseLeave)

        // 클린업을 위해 함수 반환
        return () => {
          toastElement.removeEventListener("mouseenter", handleMouseEnter)
          toastElement.removeEventListener("mouseleave", handleMouseLeave)
        }
      },

      // 3. DOM 트리 순회 및 조작
      enhanceToastContent: (toastElement: HTMLElement) => {
        // 모든 텍스트 노드 찾기
        const textNodes = []
        const walker = document.createTreeWalker(toastElement, NodeFilter.SHOW_TEXT, null)

        let node
        while ((node = walker.nextNode())) {
          if (node.textContent && node.textContent.trim()) {
            textNodes.push(node)
          }
        }

        // 텍스트에 글리터 효과 추가
        textNodes.forEach((textNode, index) => {
          setTimeout(() => {
            const parent = textNode.parentElement
            if (parent) {
              parent.style.textShadow = "0 0 10px rgba(255, 255, 255, 0.5)"
              setTimeout(() => {
                parent.style.textShadow = ""
              }, 500)
            }
          }, index * 200)
        })
      },

      // 4. 동적 스타일 변경
      animateToastEntry: (toastElement: HTMLElement, index: number) => {
        // 초기 상태 설정
        toastElement.style.opacity = "0"
        toastElement.style.transform = "translateX(100%) scale(0.8)"
        toastElement.style.transition = "all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)"

        // 애니메이션 시작
        setTimeout(() => {
          toastElement.style.opacity = "1"
          toastElement.style.transform = "translateX(0) scale(1)"
        }, index * 100)

        // 진동 효과 (에러 타입일 때)
        if (toastElement.dataset.type === "error") {
          setTimeout(() => {
            let shakeCount = 0
            const shake = () => {
              if (shakeCount < 6) {
                toastElement.style.transform = `translateX(${shakeCount % 2 === 0 ? "5px" : "-5px"}) scale(1)`
                shakeCount++
                setTimeout(shake, 100)
              } else {
                toastElement.style.transform = "translateX(0) scale(1)"
              }
            }
            shake()
          }, 500)
        }
      },

      // 5. 이벤트 리스너 및 인터랙션
      addClickEffects: (toastElement: HTMLElement) => {
        const handleClick = (e: Event) => {
          // 클릭 시 파티클 효과
          const rect = toastElement.getBoundingClientRect()
          const clickX = (e as MouseEvent).clientX - rect.left
          const clickY = (e as MouseEvent).clientY - rect.top

          // 파티클 생성
          for (let i = 0; i < 5; i++) {
            const particle = document.createElement("div")
            particle.className = "click-particle absolute pointer-events-none"
            particle.style.left = clickX + "px"
            particle.style.top = clickY + "px"
            particle.style.width = "4px"
            particle.style.height = "4px"
            particle.style.backgroundColor = "#00e6b4"
            particle.style.borderRadius = "50%"
            particle.style.position = "absolute"
            particle.style.zIndex = "1000"

            toastElement.appendChild(particle)

            // 파티클 애니메이션
            const angle = (Math.PI * 2 * i) / 5
            const distance = 30 + Math.random() * 20
            const endX = clickX + Math.cos(angle) * distance
            const endY = clickY + Math.sin(angle) * distance

            particle.animate(
              [
                { transform: `translate(0, 0) scale(1)`, opacity: 1 },
                { transform: `translate(${endX - clickX}px, ${endY - clickY}px) scale(0)`, opacity: 0 },
              ],
              {
                duration: 600,
                easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
              },
            ).onfinish = () => {
              particle.remove()
            }
          }
        }

        toastElement.addEventListener("click", handleClick)

        return () => {
          toastElement.removeEventListener("click", handleClick)
        }
      },
    }

    // 모든 토스트 요소에 DOM 조작 적용
    const toastElements = container.querySelectorAll("[data-toast-id]")
    const cleanupFunctions: (() => void)[] = []

    toastElements.forEach((element, index) => {
      const toastElement = element as HTMLElement
      const toastId = toastElement.dataset.toastId
      const toastData = toasts.find((t) => t.id === toastId)

      if (toastData) {
        // 각종 DOM 조작 적용
        domManipulator.addDynamicElement(toastElement, toastData)
        domManipulator.enhanceToastContent(toastElement)
        domManipulator.animateToastEntry(toastElement, index)

        // 이벤트 리스너 추가 및 클린업 함수 저장
        const hoverCleanup = domManipulator.toggleInteractiveEffects(toastElement)
        const clickCleanup = domManipulator.addClickEffects(toastElement)

        cleanupFunctions.push(hoverCleanup, clickCleanup)
      }
    })

    // 클린업
    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [toasts])

  useEffect(() => {
    toasts.forEach((toast) => {
      if (toast.duration && toast.duration > 0) {
        const timer = setTimeout(() => {
          onRemove(toast.id)
        }, toast.duration)

        return () => clearTimeout(timer)
      }
    })
  }, [toasts, onRemove])

  return (
    <div ref={containerRef} className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast, index) => {
        const Icon = toastIcons[toast.type]
        return (
          <div
            key={toast.id}
            data-toast-id={toast.id}
            data-type={toast.type}
            className={`transform transition-all duration-300 ease-in-out cursor-pointer ${
              index === 0 ? "translate-x-0 opacity-100" : "translate-x-2 opacity-90"
            }`}
            style={{
              transform: `translateY(${index * 4}px) translateX(${index * 2}px)`,
              zIndex: 50 - index,
            }}
          >
            <Card className={`${toastColors[toast.type]} border shadow-lg max-w-sm`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Icon className={`h-5 w-5 mt-0.5 ${iconColors[toast.type]} flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-white text-sm">{toast.title}</h4>
                    <p className="text-gray-300 text-xs mt-1 leading-relaxed">{toast.message}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-gray-400 hover:text-white flex-shrink-0"
                    onClick={() => onRemove(toast.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )
      })}

      <style jsx>{`
        .toast-hover {
          transition: all 0.3s ease !important;
        }
        
        .click-particle {
          pointer-events: none;
        }
        
        .dynamic-badge {
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  )
}
