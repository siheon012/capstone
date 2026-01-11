'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

interface ChatInterfaceProps {
  messages: Message[];
  inputMessage: string;
  isAnalyzing: boolean;
  videoSrc: string | null;
  videoId: string | null;
  onInputChange: (value: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  onNewChat: () => void;
  onQuickQuestion: (question: string) => void;
  onTextareaClick?: () => void;
  formatTime: (seconds: number) => string;
}

export default function ChatInterface({
  messages,
  inputMessage,
  isAnalyzing,
  videoSrc,
  videoId,
  onInputChange,
  onSendMessage,
  onNewChat,
  onQuickQuestion,
  onTextareaClick,
  formatTime,
}: ChatInterfaceProps) {
  return (
    <Card className="flex-1 min-h-[500px] lg:min-h-[600px] max-h-[90vh] lg:max-h-[85vh] bg-[#242a38] border-0 shadow-lg chat-container-flexible overflow-hidden">
      <CardContent className="p-3 md:p-4 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 md:mb-4 flex-shrink-0">
          <h2 className="text-lg md:text-xl font-semibold text-white">
            영상 분석 채팅
          </h2>
          <Button
            variant="outline"
            size="sm"
            className="border-[#6c5ce7] text-[#6c5ce7] hover:bg-[#6c5ce7] hover:text-white hover:border-[#6c5ce7] transition-all duration-200"
            onClick={onNewChat}
          >
            <MessageSquare className="h-4 w-4 mr-2" />새 채팅
          </Button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-hidden mb-3 md:mb-4 border border-[#2a3142] rounded-md chat-messages-area">
          <ScrollArea className="h-full pr-2">
            <div className="space-y-3 md:space-y-4 p-3 md:p-4 overflow-hidden">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  } w-full`}
                  style={{ minWidth: 0 }}
                >
                  <div
                    className={`max-w-[80%] sm:max-w-[85%] md:max-w-[80%] rounded-lg p-2 md:p-3 text-sm md:text-base break-words overflow-wrap-anywhere ${
                      message.role === 'user'
                        ? 'bg-[#6c5ce7] text-white'
                        : 'bg-[#2a3142] text-gray-200'
                    }`}
                    style={{
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                      hyphens: 'auto',
                      minWidth: 0,
                    }}
                  >
                    <p
                      className="whitespace-pre-wrap"
                      style={{
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {message.content}
                    </p>
                    {message.timestamp !== undefined && (
                      <div className="mt-2 pt-2 border-t border-gray-500 flex items-center justify-between">
                        <span className="text-xs opacity-75">
                          타임스탬프: {formatTime(message.timestamp)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Quick Questions */}
        {videoSrc && !isAnalyzing && (
          <div className="flex flex-wrap gap-2 mb-3 md:mb-4 flex-shrink-0">
            {[
              '이 영상에서 무슨 일이 일어났나요?',
              '중요한 이벤트가 있나요?',
              '특이한 점이 있나요?',
            ].map((question, index) => (
              <button
                key={index}
                onClick={() => onQuickQuestion(question)}
                className="px-3 py-1.5 bg-[#2a3142] hover:bg-[#3a4553] text-gray-300 text-xs md:text-sm rounded-md transition-colors border border-[#3a4553] hover:border-[#4a5563]"
              >
                {question}
              </button>
            ))}
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={onSendMessage} className="flex gap-2 flex-shrink-0">
          <Textarea
            value={inputMessage}
            onChange={(e) => onInputChange(e.target.value)}
            onClick={onTextareaClick}
            placeholder={
              !videoSrc
                ? '먼저 영상을 업로드해주세요'
                : isAnalyzing
                ? '영상 분석 중입니다...'
                : !videoId
                ? '영상 업로드가 완료될 때까지 기다려주세요...'
                : '영상에 대해 질문하세요...'
            }
            className="flex-1 bg-[#2a3142] border-[#3a4553] text-white placeholder-gray-500 text-sm md:text-base resize-none min-h-[60px] md:min-h-[80px]"
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                inputMessage.trim() &&
                !isAnalyzing &&
                videoSrc &&
                videoId
              ) {
                e.preventDefault();
                onSendMessage(e as unknown as React.FormEvent);
              }
            }}
          />
          <Button
            type="submit"
            disabled={
              !inputMessage.trim() || isAnalyzing || !videoSrc || !videoId
            }
            className={`self-end px-4 md:px-6 py-2 md:py-3 ${
              !inputMessage.trim() || isAnalyzing || !videoSrc || !videoId
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-50'
                : 'bg-[#00e6b4] hover:bg-[#00c49c] text-[#1a1f2c]'
            }`}
          >
            {isAnalyzing ? '분석 중...' : '전송'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
