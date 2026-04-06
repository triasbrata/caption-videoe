// ASR 处理面板组件

import { useCallback, useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/contexts/LocaleProvider';
import { useAppStore } from '@/stores/appStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useShowSuccess, useShowError, useShowInfo, useShowWarning } from '@/stores/messageStore';
import { asrService } from '@/services/asrService';
import type { ASRProgress } from '@/types/subtitle';
import { readFileAsArrayBuffer } from '@/utils/fileUtils';
import { 
  Mic, 
  Play, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Settings,
  Cpu,
  RefreshCw,
  Globe
} from 'lucide-react';
import { ASRLanguageSelector } from '@/components/ASR';

interface ASRPanelProps {
  className?: string;
}

export function ASRPanel({ className }: ASRPanelProps) {
  const { t } = useTranslation();
  const videoFile = useAppStore((state) => state.videoFile);
  const language = useAppStore(state => state.language);
  const deviceType = useAppStore(state => state.deviceType);
  const asrProgress = useAppStore(state => state.asrProgress);
  const isLoading = useAppStore(state => state.isLoading);
  const error = useAppStore(state => state.error);
  
  const setASRProgress = useAppStore(state => state.setASRProgress);
  const setError = useAppStore(state => state.setError);
  const setLoading = useAppStore(state => state.setLoading);
  const setLanguage = useAppStore(state => state.setLanguage);
  const setDeviceType = useAppStore(state => state.setDeviceType);
  const setStage = useAppStore(state => state.setStage);
  
  // 使用 historyStore 管理转录内容
  const setTranscript = useHistoryStore(state => state.setTranscript);
  // const transcript = useTranscript(); // 使用预定义的选择器，避免无限重渲染
  const hasTranscriptChunks = useHistoryStore((state) => state.chunks.length > 0);
  
  // 消息中心操作
  const showSuccess = useShowSuccess();
  const showError = useShowError();
  const showInfo = useShowInfo();
  const showWarning = useShowWarning();

  const [showSettings, setShowSettings] = useState(false);
  const audioBufferRef = useRef<ArrayBuffer | null>(null);

  // 设置进度回调
  useEffect(() => {
    const handleProgress = (progress: ASRProgress) => {
      setASRProgress(progress);

      // 处理完成状态
      if (progress.status === 'complete' && progress.result) {
        setTranscript(progress.result);
        setStage('edit'); // 自动切换到编辑阶段
        const chunkCount = progress.result.chunks?.length || 0;
        const duration = progress.time ? (progress.time / 1000).toFixed(1) : '0';
        showSuccess(
          t('components.asrPanel.asrCompleteMessage'),
          t('components.asrPanel.asrCompleteDetail', { count: chunkCount, duration })
        );
      }

      // 处理错误状态
      if (progress.status === 'error') {
        console.error('ASR处理进度错误:', progress.error);
        setError(`ASR处理失败: ${progress.error}`);
        showError(t('components.asrPanel.asrErrorMessage'), progress.error || t('components.asrPanel.unknownError'));
      }
      
      // 处理加载状态
      if (progress.status === 'loading') {
        showInfo(t('components.asrPanel.loadingModel'), progress.data || t('components.asrPanel.loadingModelDefault'));
      }
      
      // 处理运行状态
      if (progress.status === 'running') {
        showInfo(t('components.asrPanel.processingAudio'), t('components.asrPanel.processingAudioDetail'));
      }
      
      // 处理模型准备完成
      if (progress.status === 'loaded') {
        showSuccess(t('components.asrPanel.modelLoadSuccess'), t('components.asrPanel.modelLoadSuccessDetail'));
      }
    };

    asrService.setProgressCallback(handleProgress);

    return () => {
      asrService.setProgressCallback(() => {});
    };
  }, [setASRProgress, setTranscript, setError, setStage, showSuccess, showError, showInfo, showWarning]);

  // 设置设备类型
  useEffect(() => {
    asrService.setDevice(deviceType);
  }, [deviceType]);

  // 检查是否准备就绪
  const isReady = useCallback(() => {
    return asrService.isReady();
  }, []);

  // 加载模型
  const loadModel = useCallback(async () => {
    try {
      setLoading(true);
      await asrService.loadModel();
      showSuccess(t('components.asrPanel.modelLoadSuccess'), t('components.asrPanel.modelLoadReady'));
    } catch (error) {
      console.error('ASR模型加载失败:', error);
      const errorMessage = error instanceof Error ? error.message : t('components.asrPanel.modelLoadFailed');
      setError(errorMessage);
      showError(t('components.asrPanel.modelLoadFailed'), errorMessage);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError, showSuccess, showError]);

  // 开始转录
  const startTranscription = useCallback(async (audioBuffer: ArrayBuffer) => {
    if (!videoFile) {
      const errorMsg = t('components.asrPanel.pleaseUploadFirst');
      setError(errorMsg);
      showWarning(t('components.asrPanel.cannotStartTranscription'), errorMsg);
      return;
    }

    try {
      setLoading(true);
      showInfo(t('components.asrPanel.startASRMessage'), t('components.asrPanel.preparingAudio'));
      
      // 先确保模型已准备
      if (!asrService.isReady()) {
        setASRProgress({ status: 'loading', data: t('components.asrPanel.preparingModel') });
        showInfo(t('components.asrPanel.preparingModel'), t('components.asrPanel.preparingModelDetail'));
        await asrService.prepareModel();
      }

      // 然后进行转录
      setASRProgress({ status: 'loading', data: t('components.asrPanel.startTranscription') });
      showInfo(t('components.asrPanel.startASRMessage'), t('components.asrPanel.recognizingLanguage', { language }));
      
      await asrService.transcribeAudio(
        audioBuffer,
        language
      );

      // 注意：不在这里设置 transcript，让 progress callback 统一处理
    } catch (error) {
      console.error('ASR转录失败:', error);
      const errorMessage = error instanceof Error ? error.message : t('components.asrPanel.transcriptionFailed');
      setError(errorMessage);
      showError(t('components.asrPanel.transcriptionProcessFailed'), errorMessage);
    } finally {
      setLoading(false);
    }
  }, [videoFile, language, setLoading, setError, setASRProgress, showInfo, showWarning, showError]);

  // 重新开始转录
  const retryTranscription = useCallback(async (audioBuffer: ArrayBuffer) => {
    // 重置状态
    setASRProgress({ status: 'loading', data: t('components.asrPanel.retryTranscription') });
    showInfo(t('components.asrPanel.retryTranscriptionMessage'), t('components.asrPanel.retryTranscriptionDetail'));
    await startTranscription(audioBuffer);
  }, [startTranscription, setASRProgress, showInfo]);

  // 更改设备类型
  const changeDevice = useCallback((device: 'webgpu' | 'wasm') => {
    setDeviceType(device);
    const deviceName = device === 'webgpu' ? t('components.asrPanel.webgpuName') : t('components.asrPanel.wasmName');
    showInfo(t('components.asrPanel.deviceSwitchSuccess'), t('components.asrPanel.deviceSwitchedTo', { device: deviceName }));
  }, [setDeviceType, showInfo]);

  // 更改语言
  const changeLanguage = useCallback((newLanguage: string) => {
    setLanguage(newLanguage);
    showInfo(t('components.asrPanel.languageSwitchSuccess'), t('components.asrPanel.languageSwitchedTo', { language: newLanguage }));
  }, [setLanguage, showInfo]);

  // 准备音频数据
  const prepareAudioData = useCallback(async () => {
    if (!videoFile) {
      showWarning(t('components.asrPanel.missingVideoFile'), t('components.asrPanel.selectVideoFirst'));
      return null;
    }

    try {
      showInfo(t('components.asrPanel.preparingAudioData'), t('components.asrPanel.extractingAudioFromVideo'));
      audioBufferRef.current = await readFileAsArrayBuffer(videoFile.file);
      return audioBufferRef.current;
    } catch (error) {
      console.error('音频数据准备失败:', error);
      console.error('音频数据准备错误详情:', { videoFile: videoFile?.name, error });
      const errorMessage = t('components.asrPanel.audioExtractionFailed');
      showError(t('components.asrPanel.audioProcessingFailed'), errorMessage);
      return null;
    }
  }, [videoFile, showInfo, showWarning, showError]);

  // 开始ASR处理
  const handleStartASR = useCallback(async () => {
    const audioBuffer = await prepareAudioData();
    if (!audioBuffer) {
      showError(t('components.asrPanel.cannotStartProcessing'), t('components.asrPanel.audioDataPreparationFailed'));
      return;
    }

    if (!isReady()) {
      showInfo(t('components.asrPanel.preparingModel'), t('components.asrPanel.loadingASRModel'));
      await loadModel();
    }

    await startTranscription(audioBuffer);
  }, [prepareAudioData, isReady, loadModel, startTranscription, showError, showInfo]);

  // 重试ASR处理
  const handleRetryASR = useCallback(async () => {
    if (audioBufferRef.current) {
      await retryTranscription(audioBufferRef.current);
    } else {
      await handleStartASR();
    }
  }, [audioBufferRef, retryTranscription, handleStartASR]);

  // 语言变更
  const handleLanguageChange = useCallback((newLanguage: string) => {
    changeLanguage(newLanguage);
  }, [changeLanguage]);

  // 设备类型变更
  const handleDeviceChange = useCallback((newDevice: 'webgpu' | 'wasm') => {
    changeDevice(newDevice);
  }, [changeDevice]);

  // 获取简化状态显示
  const getSimpleStatus = () => {
    if (error) {
      return { icon: <AlertCircle className="h-4 w-4 text-red-500" />, text: t('components.asrPanel.statusFailed'), color: 'text-red-600' };
    }
    if (asrProgress?.status === 'complete') {
      return { icon: <CheckCircle2 className="h-4 w-4 text-green-500" />, text: t('components.asrPanel.statusCompleted'), color: 'text-green-600' };
    }
    if (isLoading || asrProgress?.status === 'loading' || asrProgress?.status === 'running') {
      return { icon: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />, text: t('components.asrPanel.statusProcessing'), color: 'text-blue-600' };
    }
    if (isReady()) {
      return { icon: <Mic className="h-4 w-4 text-green-500" />, text: t('components.asrPanel.statusReady'), color: 'text-green-600' };
    }
    return { icon: <Play className="h-4 w-4 text-muted-foreground" />, text: t('components.asrPanel.statusPending'), color: 'text-muted-foreground' };
  };

  const statusDisplay = getSimpleStatus();
  const canStart = videoFile && !isLoading && !asrProgress?.status;
  const canRetry = error || (asrProgress?.status === 'complete' && hasTranscriptChunks);

  return (
    <div className={cn('bg-card border rounded-lg p-6 space-y-4', className)}>
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center space-x-2">
          <Mic className="h-5 w-5" />
          <span>{t('components.asrPanel.title')}</span>
        </h3>
        
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 hover:bg-muted rounded-md transition-colors"
          title={t('components.asrPanel.settings')}
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {/* 设置面板 */}
      {showSettings && (
        <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ASR语言选择 */}
            <div className="space-y-2">
              <label className="flex items-center space-x-2 text-sm font-medium">
                <Globe className="h-4 w-4" />
                <span>{t('components.asrPanel.recognitionLanguage')}</span>
              </label>
              <ASRLanguageSelector
                language={language}
                onLanguageChange={handleLanguageChange}
                disabled={isLoading}
                placeholder={t('components.asrPanel.searchLanguagePlaceholder')}
              />
            </div>

            {/* 设备类型选择 */}
            <div className="space-y-2">
              <label className="flex items-center space-x-2 text-sm font-medium">
                <Cpu className="h-4 w-4" />
                <span>{t('components.asrPanel.computeDevice')}</span>
              </label>
              <select
                value={deviceType}
                onChange={(e) => handleDeviceChange(e.target.value as 'webgpu' | 'wasm')}
                className="w-full p-2 border rounded-md bg-background"
                disabled={isLoading}
              >
                <option value="webgpu">{t('components.asrPanel.webgpuRecommended')}</option>
                <option value="wasm">{t('components.asrPanel.wasmCompatible')}</option>
              </select>
            </div>
          </div>
          
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• {t('components.asrPanel.webgpuDescription')}</p>
            <p>• {t('components.asrPanel.wasmDescription')}</p>
            <p>• {t('components.asrPanel.modelDownloadNote', { size: deviceType === 'webgpu' ? '196MB' : '77MB' })}</p>
          </div>
        </div>
      )}

      {/* 状态显示 */}
      <div className="flex items-center space-x-3 p-4 border rounded-lg">
        {statusDisplay.icon}
        <div className="flex-1">
          <p className={cn('font-medium', statusDisplay.color)}>
            {statusDisplay.text}
          </p>
        </div>
      </div>

      {/* 进度显示 */}
      {asrProgress && asrProgress.progress !== undefined && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>{t('components.asrPanel.loadingProgress')}</span>
            <span>{Math.round(asrProgress.progress || 0)}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${asrProgress.progress || 0}%` }}
            />
          </div>
        </div>
      )}

      {/* 快速ASR语言选择 */}
      {!showSettings && (
        <div className="border rounded-lg p-3 bg-muted/20">
          <div className="flex items-center space-x-2 mb-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t('components.asrPanel.recognitionLanguage')}</span>
          </div>
          <ASRLanguageSelector
            language={language}
            onLanguageChange={handleLanguageChange}
            disabled={isLoading}
            className="max-w-xs"
          />
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex space-x-3">
        <button
          onClick={handleStartASR}
          disabled={!canStart}
          className={cn(
            'flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 rounded-md transition-colors',
            'font-medium text-sm',
            canStart
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          <Play className="h-4 w-4" />
          <span>{t('components.asrPanel.startGenerateSubtitles')}</span>
        </button>

        {canRetry && (
          <button
            onClick={handleRetryASR}
            className="flex items-center space-x-2 py-2.5 px-4 border rounded-md hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span>{t('common.retry')}</span>
          </button>
        )}
      </div>

      {/* 文件信息 */}
      {videoFile && (
        <div className="text-xs text-muted-foreground border-t pt-4">
          <p>{t('components.asrPanel.fileLabel')}: {videoFile.name}</p>
          <p>{t('components.asrPanel.typeLabel')}: {videoFile.type}</p>
          {videoFile.duration > 0 && (
            <p>{t('components.asrPanel.durationLabel')}: {Math.floor(videoFile.duration / 60)}:{Math.floor(videoFile.duration % 60).toString().padStart(2, '0')}</p>
          )}
        </div>
      )}
    </div>
  );
}