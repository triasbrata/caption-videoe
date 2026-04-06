// 字幕项组件

import { useCallback, useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/utils/timeUtils";
import type { SubtitleChunk } from "@/types/subtitle";
import { Play, Clock, Edit2, Save, X } from "lucide-react";
import { useUpdateChunkText } from "@/stores/historyStore";
import { useTranslation } from "@/contexts/LocaleProvider";

interface SubtitleItemProps {
  chunk: SubtitleChunk;
  index: number;
  isSelected: boolean;
  isCurrent: boolean;
  isActive: boolean;
  onToggleSelection: (chunkId: string) => void;
  onSeekTo: (time: number) => void;
  className?: string;
}

export function SubtitleItem({
  chunk,
  index,
  isSelected,
  isCurrent,
  isActive,
  onToggleSelection,
  onSeekTo,
  className,
}: SubtitleItemProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(chunk.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const updateChunkText = useUpdateChunkText();

  // 当chunk文本改变时，更新编辑文本
  useEffect(() => {
    setEditText(chunk.text);
  }, [chunk.text]);

  // 进入编辑模式时自动聚焦并选中文本
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const handleToggleSelection = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      onToggleSelection(chunk.id);
    },
    [chunk.id, onToggleSelection]
  );

  const handleChunkClick = useCallback(() => {
    if (!isEditing) {
      onSeekTo(chunk.timestamp[0]);
    }
  }, [chunk.timestamp, onSeekTo, isEditing]);

  const handlePlayClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSeekTo(chunk.timestamp[0]);
    },
    [chunk.timestamp, onSeekTo]
  );

  const handleEditClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  }, []);

  const handleSaveEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      updateChunkText(chunk.id, editText);
      setIsEditing(false);
    },
    [chunk.id, editText, updateChunkText]
  );

  const handleCancelEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditText(chunk.text); // 恢复原始文本
      setIsEditing(false);
    },
    [chunk.text]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSaveEdit(e as any);
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancelEdit(e as any);
      }
      // 阻止事件冒泡，防止触发点击事件
      e.stopPropagation();
    },
    [handleSaveEdit, handleCancelEdit]
  );

  const handleTextareaClick = useCallback((e: React.MouseEvent) => {
    // 阻止事件冒泡，防止触发行点击
    e.stopPropagation();
  }, []);

  return (
    <div
      className={cn(
        "group flex items-start space-x-3 p-3 rounded-lg cursor-pointer transition-all bg-muted/90",
        isCurrent && "border",
        isSelected && "bg-blue-50 dark:bg-blue-950/30 border-blue-200",
        !isActive && "opacity-50 bg-red-50 dark:bg-red-950/30",
        isActive && !isSelected && "hover:bg-muted/50",
        className
      )}
      onClick={handleChunkClick}
    >
      {/* 选择框 */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={handleToggleSelection}
        className="mt-1 rounded"
      />

      <div className="flex flex-col space-y-1">
        {/* 序号和时间 */}
        <div className="flex-shrink-0 text-xs text-muted-foreground flex gap-2">
          <div className="font-mono">#{index + 1}</div>
          <div className="flex items-center space-x-1">
            <Clock className="h-3 w-3" />
            <span>{formatTime(chunk.timestamp[0])}</span>
          </div>
        </div>

        {/* 字幕内容 */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                ref={textareaRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleKeyDown}
                onClick={handleTextareaClick}
                className="w-full text-sm leading-relaxed border rounded px-2 py-1 min-h-[3rem] resize-y focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder={t("components.subtitleItem.inputPlaceholder")}
              />
              <div className="flex items-center space-x-1">
                <button
                  onClick={handleSaveEdit}
                  className="flex items-center space-x-1 px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded transition-colors"
                  title={t("components.subtitleItem.saveShortcut")}
                >
                  <Save className="h-3 w-3" />
                  <span>{t("common.save")}</span>
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="flex items-center space-x-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                  title={t("components.subtitleItem.cancelShortcut")}
                >
                  <X className="h-3 w-3" />
                  <span>{t("common.cancel")}</span>
                </button>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "text-sm leading-relaxed text-primary",
                !isActive && "line-through text-muted-foreground"
              )}
            >
              {chunk.text}
            </div>
          )}
          <div className="flex items-center space-x-3 mt-2 text-xs text-muted-foreground">
            <span>
              {formatTime(chunk.timestamp[0])} -{" "}
              {formatTime(chunk.timestamp[1])}
            </span>
            <span>
              {t("components.subtitleItem.duration")}:{" "}
              {(chunk.timestamp[1] - chunk.timestamp[0]).toFixed(1)}s
            </span>
            {!isActive && (
              <span className="text-red-500 font-medium">
                {t("components.subtitleItem.deleted")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isEditing && (
          <button
            onClick={handleEditClick}
            className="p-1 hover:bg-blue-100 rounded transition-colors"
            title={t("components.subtitleItem.editSubtitle")}
          >
            <Edit2 className="h-4 w-4 text-blue-600" />
          </button>
        )}
        <button
          onClick={handlePlayClick}
          className="p-1 hover:bg-primary/10 rounded transition-colors"
          title={t("components.subtitleItem.seekToHere")}
        >
          <Play className="h-4 w-4 text-primary" />
        </button>
      </div>
    </div>
  );
}
