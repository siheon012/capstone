"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function VanillaJSDOM() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current

    // 순수 JavaScript DOM 조작 함수들
    const domFunctions = {
      // 1. 동적 요소 생성
      createElement: () => {
        const newElement = document.createElement("div")
        newElement.className = "dynamic-element bg-[#00e6b4] text-[#1a1f2c] p-2 m-1 rounded text-sm"
        newElement.textContent = `생성된 요소 ${Date.now()}`

        // 애니메이션 효과
        newElement.style.opacity = "0"
        newElement.style.transform = "translateY(20px)"

        const dynamicContainer = container.querySelector(".dynamic-container")
        if (dynamicContainer) {
          dynamicContainer.appendChild(newElement)

          // 애니메이션
          setTimeout(() => {
            newElement.style.transition = "all 0.3s ease"
            newElement.style.opacity = "1"
            newElement.style.transform = "translateY(0)"
          }, 10)
        }
      },

      // 2. 요소 제거
      removeElement: () => {
        const dynamicContainer = container.querySelector(".dynamic-container")
        const elements = dynamicContainer?.querySelectorAll(".dynamic-element")
        if (elements && elements.length > 0) {
          const lastElement = elements[elements.length - 1] as HTMLElement
          lastElement.style.transition = "all 0.3s ease"
          lastElement.style.opacity = "0"
          lastElement.style.transform = "translateX(100px)"

          setTimeout(() => {
            lastElement.remove()
          }, 300)
        }
      },

      // 3. 클래스 토글
      toggleClass: () => {
        const toggleTarget = container.querySelector(".toggle-target")
        if (toggleTarget) {
          toggleTarget.classList.toggle("bg-[#6c5ce7]")
          toggleTarget.classList.toggle("bg-[#ff6b6b]")
          toggleTarget.classList.toggle("scale-110")
        }
      },

      // 4. 스타일 동적 변경
      changeStyle: () => {
        const styleTarget = container.querySelector(".style-target") as HTMLElement
        if (styleTarget) {
          const colors = ["#00e6b4", "#6c5ce7", "#ff6b6b", "#ffd93d", "#6c5ce7"]
          const randomColor = colors[Math.floor(Math.random() * colors.length)]

          styleTarget.style.backgroundColor = randomColor
          styleTarget.style.transform = `rotate(${Math.random() * 360}deg) scale(${0.8 + Math.random() * 0.4})`
          styleTarget.style.borderRadius = `${Math.random() * 50}px`
        }
      },

      // 5. 이벤트 리스너 동적 추가
      addEventListener: () => {
        const eventTarget = container.querySelector(".event-target")
        if (eventTarget) {
          // 기존 이벤트 제거
          const newEventTarget = eventTarget.cloneNode(true)
          eventTarget.parentNode?.replaceChild(newEventTarget, eventTarget)

          // 새 이벤트 추가
          newEventTarget.addEventListener("click", () => {
            const messages = ["클릭되었습니다!", "DOM 이벤트 작동!", "JavaScript 파워!", "순수 JS 최고!"]
            const randomMessage = messages[Math.floor(Math.random() * messages.length)]

            // 임시 메시지 표시
            const messageDiv = document.createElement("div")
            messageDiv.className = "absolute top-0 left-0 bg-black text-white p-2 rounded text-xs z-10"
            messageDiv.textContent = randomMessage
            messageDiv.style.transform = "translateY(-100%)"

            newEventTarget.appendChild(messageDiv)

            setTimeout(() => {
              messageDiv.remove()
            }, 2000)
          })
        }
      },

      // 6. DOM 트리 순회
      traverseDOM: () => {
        const traverseContainer = container.querySelector(".traverse-container")
        if (traverseContainer) {
          const allElements = traverseContainer.querySelectorAll("*")

          allElements.forEach((element, index) => {
            setTimeout(() => {
              element.classList.add("highlight")
              setTimeout(() => {
                element.classList.remove("highlight")
              }, 500)
            }, index * 200)
          })
        }
      },
    }

    // 버튼 이벤트 리스너 추가
    const buttons = container.querySelectorAll("button")
    buttons.forEach((button) => {
      const action = button.getAttribute("data-action") as keyof typeof domFunctions
      if (action && domFunctions[action]) {
        button.addEventListener("click", domFunctions[action])
      }
    })

    // 클린업
    return () => {
      buttons.forEach((button) => {
        button.removeEventListener(
          "click",
          domFunctions[button.getAttribute("data-action") as keyof typeof domFunctions],
        )
      })
    }
  }, [])

  return (
    <Card className="bg-[#242a38] border-0 shadow-lg">
      <CardContent className="p-6">
        <h3 className="text-xl font-semibold text-white mb-4">순수 JavaScript DOM 조작</h3>

        <div ref={containerRef} className="space-y-4">
          {/* 컨트롤 버튼들 */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <Button
              data-action="createElement"
              variant="outline"
              size="sm"
              className="border-[#00e6b4] text-[#00e6b4] hover:bg-[#00e6b4] hover:text-[#1a1f2c]"
            >
              요소 생성
            </Button>

            <Button
              data-action="removeElement"
              variant="outline"
              size="sm"
              className="border-[#ff6b6b] text-[#ff6b6b] hover:bg-[#ff6b6b] hover:text-white"
            >
              요소 제거
            </Button>

            <Button
              data-action="toggleClass"
              variant="outline"
              size="sm"
              className="border-[#3694ff] text-[#3694ff] hover:bg-[#3694ff] hover:text-white"
            >
              클래스 토글
            </Button>

            <Button
              data-action="changeStyle"
              variant="outline"
              size="sm"
              className="border-[#ffd93d] text-[#ffd93d] hover:bg-[#ffd93d] hover:text-[#1a1f2c]"
            >
              스타일 변경
            </Button>

            <Button
              data-action="addEventListener"
              variant="outline"
              size="sm"
              className="border-[#6c5ce7] text-[#6c5ce7] hover:bg-[#6c5ce7] hover:text-white"
            >
              이벤트 추가
            </Button>

            <Button
              data-action="traverseDOM"
              variant="outline"
              size="sm"
              className="border-[#00e6b4] text-[#00e6b4] hover:bg-[#00e6b4] hover:text-[#1a1f2c]"
            >
              DOM 순회
            </Button>
          </div>

          {/* 동적 요소 컨테이너 */}
          <div className="dynamic-container min-h-[100px] border border-[#2a3142] rounded p-4">
            <p className="text-gray-400 text-sm mb-2">동적 생성 요소들:</p>
          </div>

          {/* 테스트 요소들 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="toggle-target bg-[#6c5ce7] h-16 rounded transition-all duration-300 flex items-center justify-center text-white text-sm">
              토글 대상
            </div>

            <div className="style-target bg-[#00e6b4] h-16 rounded transition-all duration-500 flex items-center justify-center text-[#1a1f2c] text-sm">
              스타일 대상
            </div>

            <div className="event-target relative bg-[#ff6b6b] h-16 rounded cursor-pointer flex items-center justify-center text-white text-sm hover:bg-opacity-80 transition-all">
              이벤트 대상
            </div>
          </div>

          {/* DOM 순회 테스트 컨테이너 */}
          <div className="traverse-container border border-[#2a3142] rounded p-4">
            <p className="text-gray-400 text-sm mb-2">DOM 순회 테스트:</p>
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-[#1a1f2c] h-8 rounded"></div>
              <div className="bg-[#2a3142] h-8 rounded"></div>
              <div className="bg-[#6c5ce7] h-8 rounded"></div>
              <div className="bg-[#00e6b4] h-8 rounded"></div>
            </div>
          </div>
        </div>
      </CardContent>

      <style jsx>{`
        .highlight {
          animation: highlight 0.5s ease-in-out;
          transform: scale(1.1);
          box-shadow: 0 0 20px rgba(0, 230, 180, 0.5);
        }
        
        @keyframes highlight {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1.1); }
        }
      `}</style>
    </Card>
  )
}
