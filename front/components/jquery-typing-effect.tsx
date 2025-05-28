"use client"

import { useEffect, useRef } from "react"

declare global {
  interface Window {
    $: any
    jQuery: any
  }
}

interface TypingEffectProps {
  texts: string[]
  speed?: number
  deleteSpeed?: number
  pauseTime?: number
}

export default function JQueryTypingEffect({
  texts,
  speed = 100,
  deleteSpeed = 50,
  pauseTime = 2000,
}: TypingEffectProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const initializeTyping = () => {
      if (typeof window !== "undefined" && window.$ && containerRef.current) {
        const $ = window.$
        const $container = $(containerRef.current)
        const $textElement = $container.find(".typing-text")
        const $cursor = $container.find(".typing-cursor")

        let currentTextIndex = 0
        let currentCharIndex = 0
        let isDeleting = false

        // 커서 깜빡임 애니메이션
        const blinkCursor = () => {
          $cursor.fadeOut(500).fadeIn(500, blinkCursor)
        }
        blinkCursor()

        // 타이핑 애니메이션 함수
        const typeText = () => {
          const currentText = texts[currentTextIndex]

          if (!isDeleting) {
            // 타이핑 중
            if (currentCharIndex < currentText.length) {
              $textElement.text(currentText.substring(0, currentCharIndex + 1))
              currentCharIndex++
              setTimeout(typeText, speed)
            } else {
              // 타이핑 완료, 잠시 대기 후 삭제 시작
              setTimeout(() => {
                isDeleting = true
                typeText()
              }, pauseTime)
            }
          } else {
            // 삭제 중
            if (currentCharIndex > 0) {
              $textElement.text(currentText.substring(0, currentCharIndex - 1))
              currentCharIndex--
              setTimeout(typeText, deleteSpeed)
            } else {
              // 삭제 완료, 다음 텍스트로 이동
              isDeleting = false
              currentTextIndex = (currentTextIndex + 1) % texts.length
              setTimeout(typeText, speed)
            }
          }
        }

        // 애니메이션 시작
        typeText()

        return () => {
          $cursor.stop(true, true)
        }
      }
    }

    const checkJQuery = setInterval(() => {
      if (typeof window !== "undefined" && window.$) {
        clearInterval(checkJQuery)
        const cleanup = initializeTyping()
        return cleanup
      }
    }, 100)

    return () => {
      clearInterval(checkJQuery)
    }
  }, [texts, speed, deleteSpeed, pauseTime])

  return (
    <div ref={containerRef} className="typing-container">
      <span className="typing-text text-2xl font-bold text-[#00e6b4]"></span>
      <span className="typing-cursor text-2xl font-bold text-[#00e6b4]">|</span>
    </div>
  )
}
