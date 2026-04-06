// 导出设置对话框组件

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/contexts/LocaleProvider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Download, 
  FileText, 
  Video, 
  Settings,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

export interface VideoExportOptions {
  format: 'mp4' | 'webm';
  quality: 'high' | 'medium' | 'low';
  subtitleProcessing: 'none' | 'soft' | 'hard';
}

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exportType: 'subtitles' | 'video';
  onExportSubtitles: (format: 'srt' | 'json') => void;
  onExportVideo: (options: VideoExportOptions) => void;
}

export function ExportDialog({
  open,
  onOpenChange,
  exportType,
  onExportSubtitles,
  onExportVideo
}: ExportDialogProps) {
  const { t } = useTranslation();
  const [videoOptions, setVideoOptions] = useState<VideoExportOptions>({
    format: 'mp4',
    quality: 'medium',
    subtitleProcessing: 'none',
  });

  const handleSubtitleExport = (format: 'srt' | 'json') => {
    onExportSubtitles(format);
    onOpenChange(false);
  };

  const handleVideoExport = () => {
    onExportVideo(videoOptions);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            {exportType === 'subtitles' ? (
              <>
                <FileText className="h-5 w-5 text-primary" />
                <span>{t('components.exportDialog.exportSubtitlesTitle')}</span>
              </>
            ) : (
              <>
                <Video className="h-5 w-5 text-primary" />
                <span>{t('components.exportDialog.exportVideoTitle')}</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {exportType === 'subtitles'
              ? t('components.exportDialog.subtitleFormatDescription')
              : t('components.exportDialog.videoConfigDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {exportType === 'subtitles' ? (
            /* 字幕导出选项 */
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => handleSubtitleExport('srt')}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold">{t('components.exportDialog.srtFormat')}</div>
                      <div className="text-sm text-muted-foreground">{t('components.exportDialog.srtDescription')}</div>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-muted-foreground" />
                </button>

                <button
                  onClick={() => handleSubtitleExport('json')}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                      <Settings className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold">{t('components.exportDialog.jsonFormat')}</div>
                      <div className="text-sm text-muted-foreground">{t('components.exportDialog.jsonDescription')}</div>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div className="flex items-start space-x-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">
                <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-blue-900 dark:text-blue-100">{t('components.exportDialog.onlyExportKept')}</div>
                  <div className="text-blue-700 dark:text-blue-300 mt-1">
                    {t('components.exportDialog.deletedNotIncluded')}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* 视频导出选项 */
            <div className="space-y-4">
              {/* 格式选择 */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('components.exportDialog.outputFormat')}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setVideoOptions(prev => ({ ...prev, format: 'mp4' }))}
                    className={cn(
                      'p-3 border rounded-lg text-left transition-colors',
                      videoOptions.format === 'mp4'
                        ? 'border-primary bg-primary/10'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <div className="font-semibold">MP4</div>
                    <div className="text-xs text-muted-foreground">{t('components.exportDialog.mp4Compatible')}</div>
                  </button>
                  <button
                    onClick={() => setVideoOptions(prev => ({ ...prev, format: 'webm' }))}
                    className={cn(
                      'p-3 border rounded-lg text-left transition-colors',
                      videoOptions.format === 'webm'
                        ? 'border-primary bg-primary/10'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <div className="font-semibold">WebM</div>
                    <div className="text-xs text-muted-foreground">{t('components.exportDialog.webmSmaller')}</div>
                  </button>
                </div>
              </div>

              {/* 质量选择 */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('components.exportDialog.outputQuality')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['high', 'medium', 'low'] as const).map((quality) => (
                    <button
                      key={quality}
                      onClick={() => setVideoOptions(prev => ({ ...prev, quality }))}
                      className={cn(
                        'p-2 border rounded text-sm transition-colors',
                        videoOptions.quality === quality
                          ? 'border-primary bg-primary/10'
                          : 'hover:bg-muted/50'
                      )}
                    >
                      {quality === 'high' ? t('components.exportDialog.qualityHigh') : quality === 'medium' ? t('components.exportDialog.qualityMedium') : t('components.exportDialog.qualityLow')}
                    </button>
                  ))}
                </div>
              </div>

              {/* 字幕处理选项 */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('components.exportDialog.subtitleProcessing')}</label>
                <div className="space-y-2">
                  <button
                    onClick={() => setVideoOptions(prev => ({ ...prev, subtitleProcessing: 'none' }))}
                    className={cn(
                      'w-full p-3 border rounded-lg text-left transition-colors',
                      videoOptions.subtitleProcessing === 'none'
                        ? 'border-primary bg-primary/10'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <div className="font-semibold">{t('components.exportDialog.noSubtitle')}</div>
                    <div className="text-xs text-muted-foreground">{t('components.exportDialog.noSubtitleDescription')}</div>
                  </button>
                  
                  <button
                    onClick={() => setVideoOptions(prev => ({ ...prev, subtitleProcessing: 'soft' }))}
                    className={cn(
                      'w-full p-3 border rounded-lg text-left transition-colors',
                      videoOptions.subtitleProcessing === 'soft'
                        ? 'border-primary bg-primary/10'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <div className="font-semibold">{t('components.exportDialog.softBurn')}</div>
                    <div className="text-xs text-muted-foreground">{t('components.exportDialog.softBurnDescription')}</div>
                  </button>
                  
                  <button
                    onClick={() => setVideoOptions(prev => ({ ...prev, subtitleProcessing: 'hard' }))}
                    className={cn(
                      'w-full p-3 border rounded-lg text-left transition-colors',
                      videoOptions.subtitleProcessing === 'hard'
                        ? 'border-primary bg-primary/10'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <div className="font-semibold">{t('components.exportDialog.hardBurn')}</div>
                    <div className="text-xs text-muted-foreground">{t('components.exportDialog.hardBurnDescription')}</div>
                  </button>
                </div>
              </div>

              {/* 警告信息 */}
              <div className="flex items-start space-x-2 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-orange-900 dark:text-orange-100">{t('components.exportDialog.exportNotes')}</div>
                  <div className="text-orange-700 dark:text-orange-300 mt-1">
                    {t('components.exportDialog.exportWarning')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {exportType === 'video' && (
          <DialogFooter>
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-sm border rounded-md hover:bg-muted/50 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleVideoExport}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              {t('components.exportDialog.startExport')}
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}