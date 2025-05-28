"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Info, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface TooltipData {
  title: string
  content: string
  timestamp?: number
}

interface DraggableTooltipProps {
  data: TooltipData | null
  onClose: () => void
}

export default function DraggableTooltip({ data, onClose }: DraggableTooltipProps) {
  const [position, setPosition] = useState({ x: 100, y: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, dragOffset])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect()
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      })
      setIsDragging(true)
    }
  }

  if (!data) return null

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50 cursor-move"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: "translate(0, 0)",
      }}
      onMouseDown={handleMouseDown}
    >
      <Card className="bg-[#242a38] border border-[#00e6b4] shadow-2xl max-w-xs">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-[#00e6b4]" />
              <h3 className="font-semibold text-white text-sm">{data.title}</h3>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-white" onClick={onClose}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <p className="text-gray-300 text-xs leading-relaxed">{data.content}</p>
          {data.timestamp && (
            <div className="mt-2 text-xs text-[#00e6b4]">
              타임스탬프: {Math.floor(data.timestamp / 60)}:{(data.timestamp % 60).toString().padStart(2, "0")}
            </div>
          )}
          <div className="mt-2 text-xs text-gray-500">드래그하여 이동 가능</div>
        </CardContent>
      </Card>
    </div>
  )
}
