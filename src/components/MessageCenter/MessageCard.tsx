// 消息卡片组件
import { cn } from '@/lib/utils';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info, Clock, Loader2 } from 'lucide-react';
import { useTranslation } from '@/contexts/LocaleProvider';
import type { Message } from '@/types/message';

interface MessageCardProps {
  message: Message;
  onMarkAsRead: (id: string) => void;
  onRemove: (id: string) => void;
}

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  processing: Loader2,
};

const colorMap = {
  success: {
    border: 'border-green-200 dark:border-green-800',
    bg: 'bg-green-50/50 dark:bg-green-950/20',
    icon: 'text-green-600 dark:text-green-400',
  },
  error: {
    border: 'border-red-200 dark:border-red-800',
    bg: 'bg-red-50/50 dark:bg-red-950/20',
    icon: 'text-red-600 dark:text-red-400',
  },
  warning: {
    border: 'border-yellow-200 dark:border-yellow-800',
    bg: 'bg-yellow-50/50 dark:bg-yellow-950/20',
    icon: 'text-yellow-600 dark:text-yellow-400',
  },
  info: {
    border: 'border-blue-200 dark:border-blue-800',
    bg: 'bg-blue-50/50 dark:bg-blue-950/20',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  processing: {
    border: 'border-purple-200 dark:border-purple-800',
    bg: 'bg-purple-50/50 dark:bg-purple-950/20',
    icon: 'text-purple-600 dark:text-purple-400',
  },
};

function formatRelativeTime(timestamp: number, t: (path: string, params?: Record<string, string | number>) => string) {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) {
    return t('components.messageCard.justNow');
  } else if (diff < 3600000) {
    return t('components.messageCard.minutesAgo', { minutes: Math.floor(diff / 60000) });
  } else if (diff < 86400000) {
    return t('components.messageCard.hoursAgo', { hours: Math.floor(diff / 3600000) });
  } else {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

export function MessageCard({ message, onMarkAsRead, onRemove }: MessageCardProps) {
  const { t } = useTranslation();
  const Icon = iconMap[message.type];
  const colors = colorMap[message.type];

  const handleCardClick = () => {
    if (!message.read) {
      onMarkAsRead(message.id);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(message.id);
  };

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (message.action?.handler) {
      message.action.handler();
    }
  };

  return (
    <div
      className={cn(
        'p-4 rounded-lg border transition-all duration-200 cursor-pointer',
        'hover:shadow-md hover:border-primary/20',
        colors.border,
        message.read ? 'opacity-75' : colors.bg,
        !message.read && 'ring-1 ring-primary/10'
      )}
      onClick={handleCardClick}
    >
      <div className="flex items-start space-x-3">
        {/* 未读标识 */}
        {!message.read && (
          <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
        )}
        
        {/* 图标 */}
        <div className="flex-shrink-0 mt-0.5">
          <Icon className={cn('h-5 w-5', colors.icon, message.type === 'processing' && 'animate-spin')} />
        </div>
        
        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <h4 className={cn(
              'text-sm font-medium text-foreground',
              !message.read && 'font-semibold'
            )}>
              {message.title}
            </h4>
            
            <button
              onClick={handleRemove}
              className="ml-2 p-1 hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          
          {message.content && (
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              {message.content}
            </p>
          )}
          
          {/* 视频处理进度条 */}
          {message.progress && (
            <div className="mt-3 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground capitalize">
                  {message.progress.stage === 'analyzing' && t('components.messageCard.stageAnalyzing')}
                  {message.progress.stage === 'cutting' && t('components.messageCard.stageCutting')}
                  {message.progress.stage === 'encoding' && t('components.messageCard.stageEncoding')}
                  {message.progress.stage === 'complete' && t('components.messageCard.stageComplete')}
                  {message.progress.stage === 'error' && t('components.messageCard.stageError')}
                </span>
                <span className="text-muted-foreground">{message.progress.progress}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    message.progress.stage === 'analyzing' && 'bg-blue-500',
                    message.progress.stage === 'cutting' && 'bg-orange-500',
                    message.progress.stage === 'encoding' && 'bg-purple-500',
                    message.progress.stage === 'complete' && 'bg-green-500',
                    message.progress.stage === 'error' && 'bg-red-500',
                  )}
                  style={{ width: `${message.progress.progress}%` }}
                />
              </div>
              {message.progress.error && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {message.progress.error}
                </p>
              )}
            </div>
          )}
          
          {/* 操作按钮 */}
          {message.action && (
            <div className="mt-3">
              <button
                onClick={handleActionClick}
                className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
              >
                {message.action.label}
              </button>
            </div>
          )}
          
          {/* 时间戳 */}
          <div className="flex items-center mt-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 mr-1" />
            <time dateTime={new Date(message.timestamp).toISOString()}>
              {formatRelativeTime(message.timestamp, t)}
            </time>
            {message.persistent && (
              <span className="ml-2 px-1.5 py-0.5 bg-muted rounded text-xs">
                {t('components.messageCard.pinned')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}