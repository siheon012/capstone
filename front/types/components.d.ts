import type * as React from 'react';

// UI 컴포넌트 타입 선언
declare module '@/components/ui/button' {
  import { VariantProps } from 'class-variance-authority';

  const buttonVariants: (props?: {
    variant?:
      | 'default'
      | 'destructive'
      | 'outline'
      | 'secondary'
      | 'ghost'
      | 'link';
    size?: 'default' | 'sm' | 'lg' | 'icon';
  }) => string;

  export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
      VariantProps<typeof buttonVariants> {
    asChild?: boolean;
  }

  export const Button: React.ForwardRefExoticComponent<
    ButtonProps & React.RefAttributes<HTMLButtonElement>
  >;
  export { buttonVariants };
}

declare module '@/components/ui/card' {
  export const Card: React.ForwardRefExoticComponent<
    React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>
  >;
  export const CardContent: React.ForwardRefExoticComponent<
    React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>
  >;
  export const CardHeader: React.ForwardRefExoticComponent<
    React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>
  >;
  export const CardTitle: React.ForwardRefExoticComponent<
    React.HTMLAttributes<HTMLHeadingElement> &
      React.RefAttributes<HTMLHeadingElement>
  >;
  export const CardDescription: React.ForwardRefExoticComponent<
    React.HTMLAttributes<HTMLParagraphElement> &
      React.RefAttributes<HTMLParagraphElement>
  >;
  export const CardFooter: React.ForwardRefExoticComponent<
    React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>
  >;
}

declare module '@/components/ui/separator' {
  export const Separator: React.ForwardRefExoticComponent<
    React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>
  >;
}

declare module '@/components/ui/scroll-area' {
  export const ScrollArea: React.ForwardRefExoticComponent<
    React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>
  >;
  export const ScrollBar: React.ForwardRefExoticComponent<
    React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>
  >;
}

declare module '@/components/ui/hover-card' {
  export const HoverCard: React.FC<React.HTMLAttributes<HTMLDivElement>>;
  export const HoverCardTrigger: React.FC<React.HTMLAttributes<HTMLDivElement>>;
  export const HoverCardContent: React.FC<React.HTMLAttributes<HTMLDivElement>>;
}

// 사용자 정의 컴포넌트
declare module '@/components/history-sidebar' {
  export interface HistorySidebarProps {
    onSelectHistory: (historyItem: any) => void;
    currentHistoryId?: string;
    onClose?: () => void;
  }
  // 타입 선언 제거 (실제 파일에서 정의하므로)
}

// DraggableTooltip은 컴포넌트 파일에서 직접 선언되므로 여기서 중복 선언하지 않습니다
// declare module '@/components/draggable-tooltip' {
//   export interface DraggableTooltipProps {
//     data: {
//       title: string;
//       content: string;
//       timestamp?: number;
//     } | null;
//     onClose: () => void;
//   }
//   const DraggableTooltip: React.FC<DraggableTooltipProps>;
//   export default DraggableTooltip;
// }

// ToastNotification은 컴포넌트 파일에서 직접 선언되므로 여기서 중복 선언하지 않습니다
// declare module '@/components/toast-notification' {
//   export interface Toast {
//     id: string;
//     type: 'success' | 'error' | 'info' | 'warning';
//     title: string;
//     message: string;
//     duration?: number;
//   }
//
//   export interface ToastNotificationProps {
//     toasts: Toast[];
//     onRemove: (id: string) => void;
//   }
//
//   const ToastNotification: React.FC<ToastNotificationProps>;
//   export default ToastNotification;
// }

// VideoMinimap은 컴포넌트 파일에서 직접 선언되므로 여기서 중복 선언하지 않습니다
// declare module '@/components/video-minimap' {
//   export interface VideoMinimapProps {
//     videoRef: React.RefObject<HTMLVideoElement>;
//     currentTime: number;
//     duration: number;
//     timeMarkers: number[];
//     onSeek: (time: number) => void;
//   }
//
//   const VideoMinimap: React.FC<VideoMinimapProps>;
//   export default VideoMinimap;
// }

// DragDropZone은 컴포넌트 파일에서 직접 선언되므로 여기서 중복 선언하지 않습니다
// declare module '@/components/drag-drop-zone' {
//   export interface DragDropZoneProps {
//     onFileUpload: (file: File) => void;
//     isVisible: boolean;
//     onClose: () => void;
//   }
//
//   const DragDropZone: React.FC<DragDropZoneProps>;
//   export default DragDropZone;
// }

// JQueryCounterAnimation은 컴포넌트 파일에서 직접 선언되므로 여기서 중복 선언하지 않습니다.
// declare module '@/components/jquery-counter-animation' {
//   export interface CounterAnimationProps {
//     stats: Array<{
//       label: string;
//       value: number;
//       suffix?: string;
//       color: string;
//     }>;
//   }
//
//   const JQueryCounterAnimation: React.FC<CounterAnimationProps>;
//   export default JQueryCounterAnimation;
// }

// 타입 선언
declare module '@/app/types/history' {
  export interface HistoryItem {
    id: string;
    title: string;
    messages: {
      role: 'user' | 'assistant';
      content: string;
      timestamp?: number;
    }[];
    videoInfo?: {
      name: string;
      duration: number;
      url: string;
    };
    date?: Date | string;
    createdAt: string | Date; // 생성 시간 추가
  }

  export interface HistoryResponse {
    success: boolean;
    data: HistoryItem[];
    error?: string;
  }
}

// 서비스 선언
declare module '@/app/actions/history-service' {
  import type { HistoryItem, HistoryResponse } from '@/app/types/history';

  export function getHistoryList(): Promise<HistoryResponse>;
  export function getHistoryItem(id: string): Promise<HistoryItem | null>;
  export function saveHistory(data: Partial<HistoryItem>): Promise<string>;
  export function deleteHistory(id: string): Promise<boolean>;
}

declare module '@/app/actions/ai-service' {
  export interface VideoAnalysisResult {
    objectDetections: {
      timestamp: number;
      objects: {
        type: string;
        confidence: number;
        boundingBox: { x: number; y: number; width: number; height: number };
      }[];
    }[];
    events: {
      timestamp: number;
      type: string;
      description: string;
    }[];
  }

  export interface ChatResponse {
    answer: string;
    relevantTimestamps: number[];
  }

  export interface PromptInteraction {
    input_prompt: string;
    output_response: string;
    user_id: number;
  }

  export function savePromptInteraction(
    data: PromptInteraction
  ): Promise<boolean>;
  export function queryChatbot(
    videoId: string,
    question: string,
    analysisResults: VideoAnalysisResult
  ): Promise<ChatResponse>;
}
