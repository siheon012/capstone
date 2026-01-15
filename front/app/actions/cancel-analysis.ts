// actions/cancel-analysis-service.ts
export async function cancelAnalysis(videoId: string) {
  const res = await fetch('/api/video/cancel_analysis/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_id: videoId }),
  });
  return await res.json();
}
