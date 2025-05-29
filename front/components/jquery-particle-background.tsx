"use client"

import { useEffect, useRef } from "react"

declare global {
  interface Window {
    $: any
    jQuery: any
  }
}

export default function JQueryParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const initializeParticles = () => {
      try {
        if (typeof window !== "undefined" && window.$ && canvasRef.current && containerRef.current) {
          const $ = window.$
          const canvas = canvasRef.current
          const ctx = canvas.getContext("2d")
          if (!ctx) return

          // 캔버스 크기 설정
          const resizeCanvas = () => {
            canvas.width = window.innerWidth
            canvas.height = window.innerHeight
          }
          resizeCanvas()

          // 파티클 배열
          const particles: Array<{
            x: number
            y: number
            vx: number
            vy: number
            size: number
            opacity: number
            color: string
          }> = []

          // 파티클 생성
          const createParticle = () => {
            return {
              x: Math.random() * canvas.width,
              y: Math.random() * canvas.height,
              vx: (Math.random() - 0.5) * 0.5,
              vy: (Math.random() - 0.5) * 0.5,
              size: Math.random() * 2 + 1,
              opacity: Math.random() * 0.5 + 0.2,
              color: Math.random() > 0.5 ? "#00e6b4" : "#6c5ce7",
            }
          }

          // 초기 파티클 생성
          for (let i = 0; i < 50; i++) {
            particles.push(createParticle())
          }

          // 애니메이션 루프
          const animateParticles = () => {
            try {
              ctx.clearRect(0, 0, canvas.width, canvas.height)

              particles.forEach((particle, index) => {
                // 파티클 이동
                particle.x += particle.vx
                particle.y += particle.vy

                // 경계 체크
                if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1
                if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1

                // 파티클 그리기
                ctx.save()
                ctx.globalAlpha = particle.opacity
                ctx.fillStyle = particle.color
                ctx.beginPath()
                ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
                ctx.fill()
                ctx.restore()

                // 연결선 그리기
                particles.forEach((otherParticle, otherIndex) => {
                  if (index !== otherIndex) {
                    const dx = particle.x - otherParticle.x
                    const dy = particle.y - otherParticle.y
                    const distance = Math.sqrt(dx * dx + dy * dy)

                    if (distance < 100) {
                      ctx.save()
                      ctx.globalAlpha = ((100 - distance) / 100) * 0.2
                      ctx.strokeStyle = particle.color
                      ctx.lineWidth = 0.5
                      ctx.beginPath()
                      ctx.moveTo(particle.x, particle.y)
                      ctx.lineTo(otherParticle.x, otherParticle.y)
                      ctx.stroke()
                      ctx.restore()
                    }
                  }
                })
              })

              requestAnimationFrame(animateParticles)
            } catch (error) {
              console.warn("Particle animation error:", error)
            }
          }

          animateParticles()

          // 마우스 인터랙션 (jQuery 이벤트)
          $(canvas)
            .off("mousemove")
            .on("mousemove", (e: any) => {
              try {
                const rect = canvas.getBoundingClientRect()
                const mouseX = e.clientX - rect.left
                const mouseY = e.clientY - rect.top

                particles.forEach((particle) => {
                  const dx = mouseX - particle.x
                  const dy = mouseY - particle.y
                  const distance = Math.sqrt(dx * dx + dy * dy)

                  if (distance < 100) {
                    particle.vx += dx * 0.0001
                    particle.vy += dy * 0.0001
                  }
                })
              } catch (error) {
                console.warn("Mouse interaction error:", error)
              }
            })

          // 윈도우 리사이즈 (jQuery 이벤트)
          $(window).off("resize.particles").on("resize.particles", resizeCanvas)

          console.log("jQuery particles initialized successfully")

          // 클린업 함수 반환
          return () => {
            try {
              $(canvas).off()
              $(window).off("resize.particles")
            } catch (error) {
              console.warn("Particle cleanup error:", error)
            }
          }
        }
      } catch (error) {
        console.warn("Particle initialization failed:", error)
        return () => {}
      }
    }

    // jQuery 로드 확인 후 초기화
    const checkJQuery = () => {
      if (typeof window !== "undefined" && window.$) {
        const cleanup = initializeParticles()
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
  }, [])

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none z-0">
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-auto" style={{ background: "transparent" }} />
    </div>
  )
}
