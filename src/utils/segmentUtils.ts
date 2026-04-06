// 视频时间区间管理工具函数

import type { SubtitleTranscript } from "../types/subtitle";
import type { TimeSegment } from "../types/history";
import { mergeTimeRanges } from "./timeUtils";

// Re-export formatTime for convenience
export { formatTime } from "./timeUtils";

/**
 * 根据选中的字幕块计算保留的时间区间
 */
export function calculateKeptSegments(
  transcript: SubtitleTranscript,
  selectedChunkIds: Set<string>
): TimeSegment[] {
  if (!transcript?.chunks.length) return [];

  // 获取所有保留的字幕块（未选中删除的）
  const keptChunks = transcript.chunks
    .filter((chunk) => !selectedChunkIds.has(chunk.id))
    .sort((a, b) => a.timestamp[0] - b.timestamp[0]);

  if (keptChunks.length === 0) return [];

  // 将字幕块转换为时间范围
  const timeRanges: [number, number][] = keptChunks.map(
    (chunk) => chunk.timestamp
  );

  // 合并连续或重叠的时间范围
  const mergedRanges = mergeTimeRanges(timeRanges);

  // 转换为时间段，计算新的连续时间轴
  let currentTime = 0;
  const segments: TimeSegment[] = mergedRanges.map((range, index) => {
    const [originalStart, originalEnd] = range;
    const duration = originalEnd - originalStart;

    const segment: TimeSegment = {
      id: `segment-${index}`,
      start: currentTime,
      end: currentTime + duration,
      originalStart,
      originalEnd,
      duration,
    };

    currentTime += duration;
    return segment;
  });

  return segments;
}

/**
 * 计算被删除的时间区间
 */
export function calculateDeletedSegments(
  transcript: SubtitleTranscript,
  selectedChunkIds: Set<string>
): TimeSegment[] {
  if (!transcript?.chunks.length) return [];

  // 获取所有被删除的字幕块
  const deletedChunks = transcript.chunks
    .filter((chunk) => selectedChunkIds.has(chunk.id))
    .sort((a, b) => a.timestamp[0] - b.timestamp[0]);

  if (deletedChunks.length === 0) return [];

  // 将删除的字幕块转换为时间范围
  const timeRanges: [number, number][] = deletedChunks.map(
    (chunk) => chunk.timestamp
  );

  // 合并连续或重叠的时间范围
  const mergedRanges = mergeTimeRanges(timeRanges);

  // 转换为时间段
  const segments: TimeSegment[] = mergedRanges.map((range, index) => {
    const [originalStart, originalEnd] = range;
    const duration = originalEnd - originalStart;

    return {
      id: `deleted-${index}`,
      start: originalStart,
      end: originalEnd,
      originalStart,
      originalEnd,
      duration,
    };
  });

  return segments;
}

/**
 * 将新时间轴上的时间转换为原始时间轴上的时间
 */
export function mapToOriginalTime(
  newTime: number,
  segments: TimeSegment[]
): number {
  // 找到包含该时间的段
  const segment = segments.find(
    (seg) => newTime >= seg.start && newTime <= seg.end
  );

  if (!segment) {
    // 如果不在任何段中，返回最近段的开始或结束时间
    if (newTime <= 0) {
      return segments[0]?.originalStart || 0;
    }

    const lastSegment = segments[segments.length - 1];
    return lastSegment?.originalEnd || 0;
  }

  // 在段内进行线性映射
  const progressInSegment = (newTime - segment.start) / segment.duration;
  return segment.originalStart + progressInSegment * segment.duration;
}

/**
 * 将原始时间轴上的时间转换为新时间轴上的时间
 */
export function mapToNewTime(
  originalTime: number,
  segments: TimeSegment[]
): number | null {
  // 找到包含该原始时间的段
  const segment = segments.find(
    (seg) =>
      originalTime >= seg.originalStart && originalTime <= seg.originalEnd
  );

  if (!segment) {
    // 原始时间在被删除的区间中
    return null;
  }

  // 在段内进行线性映射
  const progressInSegment =
    (originalTime - segment.originalStart) / segment.duration;
  return segment.start + progressInSegment * segment.duration;
}

/**
 * 检查原始时间是否在保留的区间中
 */
export function isTimeInKeptSegments(
  originalTime: number,
  segments: TimeSegment[]
): boolean {
  return segments.some(
    (seg) =>
      originalTime >= seg.originalStart && originalTime <= seg.originalEnd
  );
}

/**
 * 计算编辑会话的统计信息
 */
export function calculateEditingStats(
  transcript: SubtitleTranscript,
  selectedChunkIds: Set<string>
) {
  if (!transcript) {
    return {
      originalDuration: 0,
      currentDuration: 0,
      totalDeletedTime: 0,
      compressionRatio: 0,
      deletedChunksCount: 0,
      keptChunksCount: 0,
    };
  }

  const keptSegments = calculateKeptSegments(transcript, selectedChunkIds);
  const deletedSegments = calculateDeletedSegments(
    transcript,
    selectedChunkIds
  );

  const currentDuration = keptSegments.reduce(
    (total, seg) => total + seg.duration,
    0
  );
  const totalDeletedTime = deletedSegments.reduce(
    (total, seg) => total + seg.duration,
    0
  );
  const compressionRatio =
    transcript.duration > 0 ? currentDuration / transcript.duration : 0;

  return {
    originalDuration: transcript.duration,
    currentDuration,
    totalDeletedTime,
    compressionRatio,
    deletedChunksCount: selectedChunkIds.size,
    keptChunksCount: transcript.chunks.length - selectedChunkIds.size,
  };
}

/**
 * 格式化时间差显示
 */
export function formatTimeSaved(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}m${remainingSeconds}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h${minutes}m`;
  }
}
