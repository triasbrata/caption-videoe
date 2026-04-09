// Translation Panel - 翻译面板组件

import { useCallback, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/contexts/LocaleProvider";
import { useAppStore } from "@/stores/appStore";
import { useHistoryStore } from "@/stores/historyStore";
import {
  useShowSuccess,
  useShowError,
  useShowInfo,
  useShowWarning,
} from "@/stores/messageStore";
import { translationService } from "@/services/translationService";
import type { TranslationProgress } from "@/types/subtitle";
import {
  Languages,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { ASRLanguageSelector } from "@/components/ASR";

interface TranslationPanelProps {
  className?: string;
}

export function TranslationPanel({ className }: TranslationPanelProps) {
  const { t } = useTranslation();
  const translationProgress = useAppStore((state) => state.translationProgress);
  const translationLanguage = useAppStore((state) => state.translationLanguage);
  const language = useAppStore((state) => state.language); // source language from ASR
  const isLoading = useAppStore((state) => state.isLoading);
  const error = useAppStore((state) => state.error);

  const setTranslationProgress = useAppStore((state) => state.setTranslationProgress);
  const setTranslationLanguage = useAppStore((state) => state.setTranslationLanguage);
  const setLoading = useAppStore((state) => state.setLoading);
  const setError = useAppStore((state) => state.setError);

  // 使用 historyStore 管理转录内容（分开选择器避免 Zustand v5 无限重渲染）
  const transcriptText = useHistoryStore((state) => state.text);
  const transcriptChunks = useHistoryStore((state) => state.chunks);
  const transcriptLanguage = useHistoryStore((state) => state.language);
  const transcriptDuration = useHistoryStore((state) => state.duration);
  const transcript = {
    text: transcriptText,
    chunks: transcriptChunks,
    language: transcriptLanguage,
    duration: transcriptDuration,
  };
  const setTranscript = useHistoryStore((state) => state.setTranscript);

  // 消息中心操作
  const showSuccess = useShowSuccess();
  const showError = useShowError();
  const showInfo = useShowInfo();
  const showWarning = useShowWarning();

  // 设置进度回调
  useEffect(() => {
    const handleProgress = (progress: TranslationProgress) => {
      setTranslationProgress(progress);

      // 处理完成状态
      if (progress.status === "complete" && progress.result) {
        setTranscript(progress.result);
        const chunkCount = progress.result.chunks?.length || 0;
        showSuccess(
          t("components.translationPanel.translationComplete"),
          t("components.translationPanel.translationCompleteDetail", {
            count: chunkCount,
          })
        );
      }

      // 处理错误状态
      if (progress.status === "error") {
        console.error("Translation progress error:", progress.error);
        setError(`Translation failed: ${progress.error}`);
        showError(
          t("components.translationPanel.translationFailed"),
          progress.error || t("components.translationPanel.unknownError")
        );
      }

      // 处理加载状态
      if (progress.status === "loading") {
        showInfo(
          t("components.translationPanel.loadingModel"),
          progress.data || t("components.translationPanel.loadingModelDefault")
        );
      }

      // 处理运行状态
      if (progress.status === "running") {
        showInfo(
          t("components.translationPanel.translating"),
          progress.data || t("components.translationPanel.translatingDetail")
        );
      }

      // 处理模型准备完成
      if (progress.status === "loaded") {
        showSuccess(
          t("components.translationPanel.modelLoadSuccess"),
          t("components.translationPanel.modelLoadSuccessDetail")
        );
      }
    };

    translationService.setProgressCallback(handleProgress);

    return () => {
      translationService.setProgressCallback(() => {});
    };
  }, [setTranslationProgress, setTranscript, setError, showSuccess, showError, showInfo]);

  // 检查是否准备就绪
  const isReady = useCallback(() => {
    return translationService.isReady();
  }, []);

  // 加载模型
  const loadModel = useCallback(async () => {
    try {
      setLoading(true);
      await translationService.loadModel();
      showSuccess(
        t("components.translationPanel.modelLoadSuccess"),
        t("components.translationPanel.modelLoadReady")
      );
    } catch (error) {
      console.error("Translation model load failed:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : t("components.translationPanel.modelLoadFailed");
      setError(errorMessage);
      showError(t("components.translationPanel.modelLoadFailed"), errorMessage);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError, showSuccess, showError]);

  // 开始翻译
  const startTranslation = useCallback(async () => {
    if (!transcript || transcript.chunks.length === 0) {
      showWarning(
        t("components.translationPanel.noTranscript"),
        t("components.translationPanel.generateTranscriptFirst")
      );
      return;
    }

    try {
      setLoading(true);
      showInfo(
        t("components.translationPanel.startTranslation"),
        t("components.translationPanel.preparingModel")
      );

      // 先确保模型已准备
      if (!translationService.isReady()) {
        setTranslationProgress({
          status: "loading",
          data: t("components.translationPanel.preparingModel"),
        });
        showInfo(
          t("components.translationPanel.preparingModel"),
          t("components.translationPanel.preparingModelDetail")
        );
        await translationService.prepareModel();
      }

      // 然后进行翻译
      setTranslationProgress({
        status: "loading",
        data: t("components.translationPanel.startTranslation"),
      });
      showInfo(
        t("components.translationPanel.startTranslation"),
        t("components.translationPanel.translatingFrom", {
          source: language,
          target: translationLanguage,
        })
      );

      await translationService.translateTranscript(transcript, translationLanguage);
    } catch (error) {
      console.error("Translation failed:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : t("components.translationPanel.translationFailed");
      setError(errorMessage);
      showError(
        t("components.translationPanel.translationProcessFailed"),
        errorMessage
      );
    } finally {
      setLoading(false);
    }
  }, [
    transcript,
    language,
    translationLanguage,
    setLoading,
    setError,
    setTranslationProgress,
    showInfo,
    showWarning,
    showError,
  ]);

  // 重新开始翻译
  const retryTranslation = useCallback(async () => {
    setTranslationProgress({
      status: "loading",
      data: t("components.translationPanel.retryTranslation"),
    });
    showInfo(
      t("components.translationPanel.retryTranslationMessage"),
      t("components.translationPanel.retryTranslationDetail")
    );
    await startTranslation();
  }, [startTranslation, setTranslationProgress, showInfo]);

  // 更改目标语言
  const handleLanguageChange = useCallback(
    (newLanguage: string) => {
      setTranslationLanguage(newLanguage);
      showInfo(
        t("components.translationPanel.languageSwitchSuccess"),
        t("components.translationPanel.languageSwitchedTo", { language: newLanguage })
      );
    },
    [setTranslationLanguage, showInfo]
  );

  // 获取简化状态显示
  const getSimpleStatus = () => {
    if (error) {
      return {
        icon: <AlertCircle className="h-4 w-4 text-red-500" />,
        text: t("components.translationPanel.statusFailed"),
        color: "text-red-600",
      };
    }
    if (translationProgress?.status === "complete") {
      return {
        icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
        text: t("components.translationPanel.statusCompleted"),
        color: "text-green-600",
      };
    }
    if (
      isLoading ||
      translationProgress?.status === "loading" ||
      translationProgress?.status === "running"
    ) {
      return {
        icon: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
        text: t("components.translationPanel.statusProcessing"),
        color: "text-blue-600",
      };
    }
    if (isReady()) {
      return {
        icon: <Languages className="h-4 w-4 text-green-500" />,
        text: t("components.translationPanel.statusReady"),
        color: "text-green-600",
      };
    }
    return {
      icon: <Play className="h-4 w-4 text-muted-foreground" />,
      text: t("components.translationPanel.statusPending"),
      color: "text-muted-foreground",
    };
  };

  const statusDisplay = getSimpleStatus();
  const canStart = transcript && transcript.chunks.length > 0 && !isLoading && !translationProgress?.status;
  const canRetry = error || translationProgress?.status === "complete";

  return (
    <div className={cn("bg-card border rounded-lg p-6 space-y-4", className)}>
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center space-x-2">
          <Languages className="h-5 w-5" />
          <span>{t("components.translationPanel.title")}</span>
        </h3>
      </div>

      {/* 状态显示 */}
      <div className="flex items-center space-x-3 p-4 border rounded-lg">
        {statusDisplay.icon}
        <div className="flex-1">
          <p className={cn("font-medium", statusDisplay.color)}>
            {statusDisplay.text}
          </p>
        </div>
      </div>

      {/* 进度显示 */}
      {translationProgress && translationProgress.progress !== undefined && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>{t("components.translationPanel.translationProgress")}</span>
            <span>
              {translationProgress.progress}/{translationProgress.total}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{
                width: `${((translationProgress.progress || 0) / (translationProgress.total || 1)) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* 目标语言选择 */}
      <div className="border rounded-lg p-3 bg-muted/20">
        <div className="flex items-center space-x-2 mb-2">
          <Languages className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {t("components.translationPanel.targetLanguage")}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <span>
            {t("components.translationPanel.from")}: {language}
          </span>
          <span>→</span>
          <span>
            {t("components.translationPanel.to")}: {translationLanguage}
          </span>
        </div>
        <ASRLanguageSelector
          language={translationLanguage}
          onLanguageChange={handleLanguageChange}
          disabled={isLoading}
          className="max-w-xs"
          placeholder={t("components.translationPanel.searchLanguagePlaceholder")}
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex space-x-3">
        <button
          onClick={startTranslation}
          disabled={!canStart}
          className={cn(
            "flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 rounded-md transition-colors",
            "font-medium text-sm",
            canStart
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          <Languages className="h-4 w-4" />
          <span>{t("components.translationPanel.startTranslation")}</span>
        </button>

        {canRetry && (
          <button
            onClick={retryTranslation}
            className="flex items-center space-x-2 py-2.5 px-4 border rounded-md hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span>{t("common.retry")}</span>
          </button>
        )}
      </div>

      {/* 源文本信息 */}
      {transcript && transcript.chunks.length > 0 && (
        <div className="text-xs text-muted-foreground border-t pt-4">
          <p>
            {t("components.translationPanel.sourceLanguage")}: {transcript.language}
          </p>
          <p>
            {t("components.translationPanel.chunkCount")}: {transcript.chunks.length}
          </p>
        </div>
      )}
    </div>
  );
}