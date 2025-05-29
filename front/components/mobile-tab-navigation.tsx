"use client"

import { Button } from "@/components/ui/button"
import { Video, MessageSquare, History, Upload } from "lucide-react"

interface MobileTabNavigationProps {
  activeTab: "video" | "chat" | "history"
  onTabChange: (tab: "video" | "chat" | "history") => void
  onUpload: () => void
}

export default function MobileTabNavigation({ activeTab, onTabChange, onUpload }: MobileTabNavigationProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#242a38] border-t border-[#2a3142] px-4 py-2 md:hidden">
      <div className="flex items-center justify-around">
        <Button
          variant="ghost"
          size="sm"
          className={`flex flex-col items-center gap-1 px-3 py-2 ${
            activeTab === "video" ? "text-[#00e6b4] bg-[#00e6b4]/10" : "text-gray-400 hover:text-[#00e6b4]"
          }`}
          onClick={() => onTabChange("video")}
        >
          <Video className="h-5 w-5" />
          <span className="text-xs">비디오</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className={`flex flex-col items-center gap-1 px-3 py-2 ${
            activeTab === "chat" ? "text-[#00e6b4] bg-[#00e6b4]/10" : "text-gray-400 hover:text-[#00e6b4]"
          }`}
          onClick={() => onTabChange("chat")}
        >
          <MessageSquare className="h-5 w-5" />
          <span className="text-xs">채팅</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="flex flex-col items-center gap-1 px-3 py-2 text-gray-400 hover:text-[#00e6b4]"
          onClick={onUpload}
        >
          <Upload className="h-5 w-5" />
          <span className="text-xs">업로드</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className={`flex flex-col items-center gap-1 px-3 py-2 ${
            activeTab === "history" ? "text-[#00e6b4] bg-[#00e6b4]/10" : "text-gray-400 hover:text-[#00e6b4]"
          }`}
          onClick={() => onTabChange("history")}
        >
          <History className="h-5 w-5" />
          <span className="text-xs">히스토리</span>
        </Button>
      </div>
    </div>
  )
}
