# 🔍 히스토리 카드 가로 넘침 문제 분석

## 현상
- 히스토리 사이드바의 세션 카드가 가로로 넘쳐남
- 특히 긴 파일명 (예: "20250526_185753.mp4의 2번째 세션")이 넘침

## Step 1: 부모 컨테이너 분석

### HistoryLayout.tsx (최상위 부모)
```tsx
// 데스크톱
<div style={{
  width: '35vw',          // ✅ 명확한 너비
  maxWidth: '600px',      // ✅ 최대 너비 제한
  minWidth: '400px',      // ✅ 최소 너비 보장
}}>

// 모바일
<div className="fixed inset-0">  // ✅ 전체 화면
  <div className="flex-1 h-[calc(100vh-80px)] overflow-hidden">
```

**결과:** ✅ 부모는 명확한 너비 제한이 있음

---

## Step 2: HistorySidebar 최상위 div

```tsx
<div
  className="history-content w-full"  // w-full = width: 100%
  style={{
    width: isMobile ? '100vw' : '100%',
    maxWidth: isMobile ? '100vw' : '100%',
    overflow: 'hidden',  // ✅ overflow 숨김 설정됨
  }}
>
```

**결과:** ✅ 컨테이너 레벨에서 overflow hidden 설정됨

---

## Step 3: 스크롤 영역

```tsx
<ScrollArea className="h-full history-scrollbar">
  <div className="p-3 sm:p-4 space-y-3">  // ❓ 여기서 패딩이 추가됨
```

**의심 포인트 1:** 
- `p-3` = padding 0.75rem (12px)
- `sm:p-4` = padding 1rem (16px) @ sm 브레이크포인트
- 패딩이 추가되면서 **실제 가용 너비가 줄어듦**

---

## Step 4: Card 컴포넌트

```tsx
<Card className="w-full overflow-hidden">
  <CardContent className="p-3 overflow-hidden">
```

**의심 포인트 2:**
- `w-full` = width: 100%
- 하지만 **부모의 패딩을 고려하지 않음**
- CardContent에도 `p-3` 패딩 추가

**총 너비 계산:**
```
부모 컨테이너: 400px (minWidth)
- ScrollArea 패딩 (좌): 12px
- ScrollArea 패딩 (우): 12px
= 사용 가능 너비: 376px

Card w-full:
- 376px를 100%로 인식
- CardContent p-3 패딩 (좌): 12px
- CardContent p-3 패딩 (우): 12px
= 실제 콘텐츠 너비: 352px
```

---

## Step 5: 문제의 핵심 - flex 컨테이너

```tsx
<div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
  <div className="flex-shrink-0 w-12">날짜</div>  // 48px 고정
  <div className="flex-1 min-w-0">
    <h3 className="truncate">긴 제목...</h3>
  </div>
</div>
```

**계산:**
```
CardContent 내부 너비: 352px
- 날짜 썸네일: 48px
- gap-3: 12px
- 삭제 버튼: 24px
- gap: 8px
= 제목 영역: 260px
```

---

## 🔴 문제 발견!

### 원인 1: `truncate` 클래스가 작동 안함

`truncate` 클래스는 다음 CSS를 적용:
```css
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

**하지만 작동하려면:**
1. **부모가 명확한 width를 가져야 함**
2. **display: block 또는 inline-block이어야 함**

현재 문제:
```tsx
<div className="flex-1 min-w-0">  // flex-1은 grow는 하지만 shrink는 제한적
  <h3 className="truncate">...</h3>
</div>
```

`flex-1`은:
- `flex-grow: 1` ✅
- `flex-shrink: 1` ❓ (하지만 min-content까지만)
- `flex-basis: 0%` ✅

**문제:** h3가 내용의 `min-content` (가장 긴 단어 길이)보다 작아지지 않으려 함!

---

## 🎯 근본 원인

### 1. CSS Flexbox의 기본 동작
- Flex 아이템은 기본적으로 **내용의 min-content보다 작아지지 않음**
- `20250526_185753.mp4의` ← 이 단어가 하나의 단어로 인식됨
- 띄어쓰기가 없어서 `min-content`가 매우 큼

### 2. `min-w-0`의 한계
- `min-width: 0`을 설정해도
- `truncate`가 제대로 작동하려면 **명확한 max-width**가 필요

### 3. `wordBreak: 'break-all'`의 문제
- `truncate`와 충돌
- `white-space: nowrap` vs `word-break: break-all` 모순

---

## ✅ 해결 방법

### 옵션 1: 명확한 max-width 설정
```tsx
<h3 
  className="truncate"
  style={{ maxWidth: '200px' }}  // 고정 너비
>
```

### 옵션 2: CSS Grid 사용
```tsx
<div style={{ 
  display: 'grid',
  gridTemplateColumns: '48px 1fr 24px',
  gap: '12px'
}}>
  <div>날짜</div>
  <div style={{ minWidth: 0 }}>
    <h3 className="truncate">제목</h3>
  </div>
  <div>버튼</div>
</div>
```

### 옵션 3: 부모에 overflow 강제
```tsx
<div className="flex-1 min-w-0 overflow-hidden">
  <h3 className="truncate w-full">제목</h3>
</div>
```

---

## 🧪 테스트가 필요한 가설

1. **flex-1 + min-w-0만으로는 부족**
   - 자식 요소가 `truncate`를 사용할 때 명확한 width/max-width 필요

2. **overflow: hidden의 전파**
   - 부모에 overflow: hidden이 있어도
   - 중간 컨테이너가 overflow를 상속하지 않으면 무용지물

3. **Tailwind의 truncate 제약**
   - inline 요소에는 작동 안함
   - width가 auto인 경우 작동 안함

---

## 🔧 다음 단계

현재 코드에서 실제로 어느 부분이 문제인지 확인:
1. 브라우저 개발자 도구로 computed styles 확인
2. 각 요소의 실제 width 측정
3. overflow 속성이 제대로 전파되는지 확인
