// 调试工具函数

import type { VideoSegment } from "@/types/video";
import type { SubtitleTranscript } from "@/types/subtitle";

export function debugVideoSegments(
  transcript: SubtitleTranscript | null,
  selectedChunks: Set<string>,
  segments: VideoSegment[]
) {
  if (!transcript) return;

  console.group("🎬 Video segment debug info");

  // 显示原始字幕块状态
  console.log("📝 Original subtitle chunk states:");
  transcript.chunks.forEach((chunk, i) => {
    const isSelected = selectedChunks.has(chunk.id);
    const status = isSelected ? "❌ Deleted" : "✅ Kept";
    console.log(
      `  ${i + 1}. ${chunk.text} (${chunk.timestamp[0]}s - ${chunk.timestamp[1]}s) ${status}`
    );
  });

  // 显示生成的视频片段
  console.log("\n🎞️ Generated video segments:");
  segments.forEach((segment, i) => {
    const duration = segment.end - segment.start;
    const status = segment.keep ? "✅ Kept" : "❌ Deleted";
    console.log(
      `  Segment ${i + 1}: ${segment.start}s - ${segment.end}s (${duration.toFixed(2)}s) ${status}`
    );
  });

  // 统计信息
  const totalOriginalDuration = transcript.duration || 0;
  const totalKeptDuration = segments
    .filter((seg) => seg.keep)
    .reduce((sum, seg) => sum + (seg.end - seg.start), 0);
  const deletedDuration = totalOriginalDuration - totalKeptDuration;

  console.log("\n📊 Statistics:");
  console.log(
    `  Original total duration: ${totalOriginalDuration.toFixed(2)}s`
  );
  console.log(`  Kept duration: ${totalKeptDuration.toFixed(2)}s`);
  console.log(`  Deleted duration: ${deletedDuration.toFixed(2)}s`);
  console.log(
    `  Compression ratio: ${((totalKeptDuration / totalOriginalDuration) * 100).toFixed(1)}%`
  );

  console.groupEnd();
}
