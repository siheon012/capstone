// components/ui/optimized-image.tsx
import React from 'react';
import { getImageUrl, getPlaceholderImage } from '@/utils/image-url';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  fallbackSrc?: string;
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className,
  width,
  height,
  fallbackSrc,
}) => {
  const imageUrl = getImageUrl(src);
  const fallbackUrl = fallbackSrc
    ? getImageUrl(fallbackSrc)
    : getPlaceholderImage();

  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.src = fallbackUrl;
  };

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={className}
      width={width}
      height={height}
      onError={handleError}
    />
  );
};

// 사용 예시:
// <OptimizedImage src="/images/ds_logo.png" alt="Logo" className="w-32 h-32" />
// <OptimizedImage src="/uploads/user-photo.jpg" alt="Profile" fallbackSrc="/images/placeholder-user.jpg" />
