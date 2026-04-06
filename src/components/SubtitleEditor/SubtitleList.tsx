// 字幕列表组件

import { useMemo, useState, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import { useHistoryStore, useChunks, useHistoryText, useHistoryLanguage, useHistoryDuration, useCanUndo, useCanRedo, useUndo, useRedo } from '@/stores/historyStore';
import { useAppStore } from '@/stores/appStore';
import { formatTime, isTimeInRange } from '@/utils/timeUtils';
import { FileText, Trash2, RotateCcw, Check, Undo, Redo } from 'lucide-react';
import { SubtitleItem } from './SubtitleItem';
import { useTranslation } from '@/contexts/LocaleProvider';
import type { EnhancedVideoPlayerRef } from '@/components/VideoPlayer/EnhancedVideoPlayer';

interface SubtitleListProps {
  className?: string;
  currentTime?: number;
  isPlaying?: boolean;
  onSeek?: (time: number) => void;
  onPlayPause?: () => void;
  videoPlayerRef?: RefObject<EnhancedVideoPlayerRef>;
}

export function SubtitleList({
  className,
  videoPlayerRef
}: SubtitleListProps) {
  const { t } = useTranslation();
  const chunks = useChunks();
  const text = useHistoryText();
  const language = useHistoryLanguage();
  const duration = useHistoryDuration();
  
  // 历史记录操作
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const undo = useUndo();
  const redo = useRedo();
  
  // 在组件层用 useMemo 创建 transcript 对象，避免无限循环
  const transcript = useMemo(() => ({
    text,
    chunks,
    language,
    duration,
  }), [text, chunks, language, duration]);
  
  // 在组件层用 useMemo 做过滤，避免无限循环
  const activeChunks = useMemo(
    () => chunks.filter(c => !c.deleted),
    [chunks]
  );
  const currentTime = useAppStore(state => state.currentTime);
  const deleteSelected = useHistoryStore(state => state.deleteSelected);
  const restoreSelected = useHistoryStore(state => state.restoreSelected);
  // const toggleDeleted = useHistoryStore(state => state.toggleDeleted);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 创建 seekTo 函数，使用 videoPlayerRef
  const seekTo = (time: number) => {
    if (videoPlayerRef?.current) {
      videoPlayerRef.current.seekTo(time);
    }
  };

  // 获取当前高亮的字幕片段
  const currentChunk = useMemo(() => {
    return transcript.chunks.find(chunk =>
      isTimeInRange(currentTime, chunk.timestamp)
    ) || null;
  }, [transcript.chunks, currentTime]);

  // 计算统计信息
  const statistics = useMemo(() => {
    const deletedChunks = transcript.chunks.filter(chunk => chunk.deleted);
    const activeCount = activeChunks.length;
    const deletedCount = deletedChunks.length;
    const totalCount = transcript.chunks.length;

    const deletedDuration = deletedChunks.reduce((sum, chunk) => 
      sum + (chunk.timestamp[1] - chunk.timestamp[0]), 0);
    const activeDuration = activeChunks.reduce((sum, chunk) => 
      sum + (chunk.timestamp[1] - chunk.timestamp[0]), 0);

    return {
      totalCount,
      activeCount,
      deletedCount,
      activeDuration,
      deletedDuration,
    };
  }, [transcript.chunks, activeChunks]);


  const handleToggleSelection = (chunkId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(chunkId)) {
      newSelected.delete(chunkId);
    } else {
      newSelected.add(chunkId);
    }
    setSelectedIds(newSelected);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size > 0) {
      deleteSelected(selectedIds);
      setSelectedIds(new Set());
    }
  };

  const handleSelectAll = () => {
    const allActiveIds = new Set(activeChunks.map(chunk => chunk.id));
    setSelectedIds(allActiveIds);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleRestoreDeleted = () => {
    const deletedIds = new Set(
      transcript.chunks
        .filter(chunk => chunk.deleted)
        .map(chunk => chunk.id)
    );
    if (deletedIds.size > 0) {
      restoreSelected(deletedIds);
    }
  };

  if (!transcript.chunks || transcript.chunks.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center p-8', className)}>
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground text-center">
          {t('components.subtitleList.noSubtitleData')}
          <br />
          {t('components.subtitleList.uploadAndGenerate')}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col space-y-4 h-full', className)}>
      {/* 操作按钮 */}
      <div className="flex flex-wrap gap-2 p-2 rounded-lg bg-card">
        {/* 历史操作按钮组 */}
        <div className="flex items-center space-x-1 pr-2 border-r border-border">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="flex items-center space-x-1 px-2.5 py-1.5 text-xs border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={t('components.subtitleList.undoLastAction')}
          >
            <Undo className="h-3 w-3" />
            <span className="hidden sm:inline">{t('components.subtitleList.undo')}</span>
          </button>
          
          <button
            onClick={redo}
            disabled={!canRedo}
            className="flex items-center space-x-1 px-2.5 py-1.5 text-xs border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={t('components.subtitleList.redoLastAction')}
          >
            <Redo className="h-3 w-3" />
            <span className="hidden sm:inline">{t('components.subtitleList.redo')}</span>
          </button>
        </div>

        {/* 选择操作按钮组 */}
        <div className="flex items-center space-x-1">
          <button
            onClick={handleSelectAll}
            className="flex items-center space-x-1 px-2.5 py-1.5 text-xs border rounded hover:bg-muted transition-colors"
          >
            <Check className="h-3 w-3" />
            <span className="hidden sm:inline">{t('components.subtitleList.selectAll')}</span>
          </button>
          
          <button
            onClick={handleClearSelection}
            className="flex items-center space-x-1 px-2.5 py-1.5 text-xs border rounded hover:bg-muted transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            <span className="hidden sm:inline">{t('components.subtitleList.clearSelection')}</span>
          </button>
        </div>
        
        <button
          onClick={handleDeleteSelected}
          disabled={selectedIds.size === 0}
          className="flex items-center space-x-1 px-2.5 py-1.5 text-xs border rounded hover:bg-red-50 hover:border-red-200 text-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Trash2 className="h-3 w-3" />
          <span>{t('components.subtitleList.deleteSelected', { count: selectedIds.size })}</span>
        </button>

        {statistics.deletedCount > 0 && (
          <button
            onClick={handleRestoreDeleted}
            className="flex items-center space-x-1 px-2.5 py-1.5 text-xs border rounded hover:bg-green-50 hover:border-green-200 text-green-600 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            <span>{t('components.subtitleList.restoreDeleted', { count: statistics.deletedCount })}</span>
          </button>
        )}
      </div>

      {/* 字幕列表 */}
      <div 
        className="flex-1 rounded-lg overflow-hidden"
      >
        <div className="overflow-y-auto space-y-2 p-2 h-full">
          {transcript.chunks.map((chunk, index) => {
            const isActive = !chunk.deleted;
            const isCurrent = currentChunk?.id === chunk.id;
            const isSelected = selectedIds.has(chunk.id);
            
            return (
              <SubtitleItem
                key={chunk.id}
                chunk={chunk}
                index={index}
                isActive={isActive}
                isCurrent={isCurrent}
                isSelected={isSelected}
                onToggleSelection={handleToggleSelection}
                onSeekTo={seekTo}
              />
            );
          })}
        </div>
      </div>

      {/* 底部统计 */}
      <div className="text-xs text-muted-foreground text-center p-2 border-t">
        {t('components.subtitleList.estimatedRetainDuration')}: {formatTime(statistics.activeDuration)} /
        {t('components.subtitleList.deletedDuration')}: {formatTime(statistics.deletedDuration)}
      </div>
    </div>
  );
}