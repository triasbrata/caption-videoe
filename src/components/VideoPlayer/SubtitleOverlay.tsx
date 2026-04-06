// 字幕覆盖层组件 - 使用 Canvas 渲染字幕（参考 WebAV EmbedSubtitlesClip）
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useChunks } from '@/stores/historyStore';
import { useTranslation } from '@/contexts/LocaleProvider';
import type { SubtitleStyle } from '@/components/SubtitleSettings';

interface SubtitleOverlayProps {
  currentTime: number;
  style: SubtitleStyle;
  onStyleChange: (style: SubtitleStyle) => void;
  containerDimensions: { width: number; height: number };
  videoDimensions: { width: number; height: number };
  className?: string;
}

export function SubtitleOverlay({
  currentTime,
  style,
  onStyleChange,
  containerDimensions,
  videoDimensions,
  className
}: SubtitleOverlayProps) {
  const { t } = useTranslation();
  const chunks = useChunks();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartOffset, setDragStartOffset] = useState(0);
  
  // Canvas 尺寸状态 - 使用传入的容器尺寸
  const canvasSize = containerDimensions;
  const [actualVideoDisplaySize, setActualVideoDisplaySize] = useState({ width: 0, height: 0 });
  
  // 获取当前时间对应的字幕 - 参考 WebAV 的时间匹配逻辑
  const currentSubtitle = useMemo(() => {
    if (!chunks || chunks.length === 0) return null;
    
    // 查找当前时间段的字幕，参考 WebAV 的 tick 方法
    return chunks.find(chunk => 
      !chunk.deleted && 
      currentTime >= chunk.timestamp[0] && 
      currentTime <= chunk.timestamp[1] &&
      chunk.text && chunk.text.trim() !== ''
    ) || null;
  }, [chunks, currentTime]);

  // 计算缩放比例和实际视频显示尺寸
  const { scaleFactor, actualVideoSize } = useMemo(() => {
    if (!videoDimensions.width || !videoDimensions.height || !containerDimensions.width || !containerDimensions.height) {
      return { scaleFactor: 1, actualVideoSize: { width: 0, height: 0 } };
    }

    // 计算视频在容器中的实际显示尺寸（保持宽高比）
    const videoAspectRatio = videoDimensions.width / videoDimensions.height;
    const containerAspectRatio = containerDimensions.width / containerDimensions.height;

    let actualDisplayWidth, actualDisplayHeight;

    if (videoAspectRatio > containerAspectRatio) {
      // 视频更宽，以宽度为准
      actualDisplayWidth = containerDimensions.width;
      actualDisplayHeight = containerDimensions.width / videoAspectRatio;
    } else {
      // 视频更高，以高度为准
      actualDisplayHeight = containerDimensions.height;
      actualDisplayWidth = containerDimensions.height * videoAspectRatio;
    }

    // 基于高度计算缩放比例（通常字幕大小与视频高度相关）
    const factor = actualDisplayHeight / videoDimensions.height;

    return {
      scaleFactor: factor,
      actualVideoSize: { width: actualDisplayWidth, height: actualDisplayHeight }
    };
  }, [videoDimensions, containerDimensions]);

  // 更新实际视频显示尺寸状态
  useEffect(() => {
    setActualVideoDisplaySize(actualVideoSize);
  }, [actualVideoSize]);

  // 缩放尺寸的辅助函数
  const scaleSize = useCallback((size: number) => {
    return Math.round(size * scaleFactor);
  }, [scaleFactor]);

  // Canvas 渲染函数 - 参考 WebAV 的 #renderTxt 方法
  const renderSubtitleToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentSubtitle) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    
    // 清空画布 - 对应 WebAV 的清空操作
    ctx.clearRect(0, 0, width, height);

    // 设置字体样式 - 对应 WebAV 的 fontFamily, fontSize, fontWeight, fontStyle，使用缩放后的尺寸
    const scaledFontSize = scaleSize(style.fontSize);
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${scaledFontSize}px ${style.fontFamily}`;
    ctx.textBaseline = 'bottom';

    // 设置字母间距 - 对应 WebAV 的 letterSpacing，使用缩放后的值
    const scaledLetterSpacing = scaleSize(style.letterSpacing);
    if (scaledLetterSpacing !== 0) {
      ctx.letterSpacing = `${scaledLetterSpacing}px`;
    }

    // 处理多行文本 - 支持换行符分割和基于视频宽度的自动换行
    const text = currentSubtitle.text;
    let lines = text.split('\n').filter(line => line.trim() !== '');

    // 自动换行逻辑 - 基于实际视频显示宽度，留出适当的边距
    // 重要：确保在测量文本前字体已经设置好
    const videoDisplayWidth = actualVideoDisplaySize.width;
    // 使用90%的视频宽度作为限制
    const maxTextWidth = Math.max(videoDisplayWidth * 0.9, width * 0.5); // 使用视频宽度的90%或Canvas宽度的50%，取较大值
    const wrappedLines: string[] = [];

    console.log('换行调试信息:', {
      videoDisplayWidth,
      canvasWidth: width,
      maxTextWidth,
      scaleFactor,
      actualVideoDisplaySize
    });

    if (maxTextWidth > 100) { // 降低最小宽度要求
      lines.forEach(line => {
        // 首先检查这一行是否需要换行
        const lineMetrics = ctx.measureText(line);
        console.log('行文本测量:', {
          line,
          lineWidth: lineMetrics.width,
          maxTextWidth,
          needsWrapping: lineMetrics.width > maxTextWidth
        });

        if (lineMetrics.width <= maxTextWidth) {
          // 不需要换行，直接使用原始行
          wrappedLines.push(line);
          return;
        }

        // 需要换行，根据文本类型选择换行策略
        const isChineseText = /[\u4e00-\u9fff]/.test(line);

        if (isChineseText) {
          // 中文文本：逐字符测量换行
          let currentLine = '';

          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const testLine = currentLine + char;
            const textMetrics = ctx.measureText(testLine);

            if (textMetrics.width <= maxTextWidth || currentLine === '') {
              currentLine = testLine;
            } else {
              // 当前行已满，推入结果并开始新行
              if (currentLine.trim()) {
                wrappedLines.push(currentLine.trim());
              }
              currentLine = char;
            }
          }

          if (currentLine.trim()) {
            wrappedLines.push(currentLine.trim());
          }
        } else {
          // 英文文本：按单词边界换行，避免切断单词
          const words = line.split(/(\s+)/); // 保留空格分隔符
          let currentLine = '';

          for (const word of words) {
            const testLine = currentLine + word;
            const testMetrics = ctx.measureText(testLine);

            if (testMetrics.width <= maxTextWidth || currentLine === '') {
              currentLine = testLine;
            } else {
              // 当前行放不下这个单词
              if (currentLine.trim()) {
                wrappedLines.push(currentLine.trim());
                currentLine = word;
              } else {
                // 单个单词太长，需要强制字符级切割
                let longWord = word.trim();
                while (longWord.length > 0) {
                  let cutIndex = longWord.length;
                  for (let i = 1; i <= longWord.length; i++) {
                    const testSubWord = longWord.substring(0, i);
                    const subMetrics = ctx.measureText(testSubWord);
                    if (subMetrics.width > maxTextWidth) {
                      cutIndex = Math.max(1, i - 1);
                      break;
                    }
                  }
                  wrappedLines.push(longWord.substring(0, cutIndex));
                  longWord = longWord.substring(cutIndex);
                }
                currentLine = '';
              }
            }
          }

          if (currentLine.trim()) {
            wrappedLines.push(currentLine.trim());
          }
        }
      });

      // 使用换行结果
      lines = wrappedLines.length > 0 ? wrappedLines : lines;
      console.log('最终使用的行数:', lines.length, '行内容:', lines);
    } else {
      console.log('maxTextWidth太小，跳过换行:', maxTextWidth);
    }

    // 计算文本位置 - 字幕基于整个容器底部定位
    // 计算视频在Canvas中的位置（用于文字对齐和换行边界）
    const videoLeft = (width - actualVideoDisplaySize.width) / 2;
    const videoTop = (height - actualVideoDisplaySize.height) / 2;
    const videoRight = videoLeft + actualVideoDisplaySize.width;

    // 字幕水平居中基于视频区域，垂直定位基于容器底部
    const centerX = videoLeft + actualVideoDisplaySize.width / 2;
    const scaledBottomOffset = scaleSize(style.bottomOffset);
    const bottomY = height - scaledBottomOffset; // 基于整个容器高度，而不是视频底部
    const scaledLineHeight = scaledFontSize * style.lineHeight;
    
    // 从下往上绘制文本行
    lines.forEach((line, index) => {
      const y = bottomY - (lines.length - 1 - index) * scaledLineHeight;
      
      // 绘制文字背景 - 对应 WebAV 的 textBgColor
      if (style.backgroundOpacity > 0) {
        const textMetrics = ctx.measureText(line);
        const textWidth = textMetrics.width;
        const scaledBgPadding = scaleSize(style.backgroundPadding);
        
        ctx.fillStyle = `${style.backgroundColor}${Math.round(style.backgroundOpacity * 255).toString(16).padStart(2, '0')}`;
        
        let bgX = centerX - textWidth / 2 - scaledBgPadding;
        if (style.textAlign === 'left') bgX = videoLeft + scaledBgPadding;
        if (style.textAlign === 'right') bgX = videoRight - textWidth - scaledBgPadding;
        
        // 绘制圆角矩形背景
        ctx.beginPath();
        const scaledBgRadius = scaleSize(style.backgroundRadius);
        ctx.roundRect(
          bgX,
          y - scaledFontSize - scaledBgPadding,
          textWidth + scaledBgPadding * 2,
          scaledLineHeight + scaledBgPadding,
          scaledBgRadius
        );
        ctx.fill();
      }
      
      // 设置文字阴影 - 对应 WebAV 的 textShadow，使用缩放后的值
      if (style.shadowBlur > 0) {
        ctx.shadowColor = style.shadowColor;
        ctx.shadowOffsetX = scaleSize(style.shadowOffsetX);
        ctx.shadowOffsetY = scaleSize(style.shadowOffsetY);
        ctx.shadowBlur = scaleSize(style.shadowBlur);
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowBlur = 0;
      }
      
      // 计算文字的X坐标，根据对齐方式
      let textX = centerX;
      if (style.textAlign === 'left') {
        textX = videoLeft;
        ctx.textAlign = 'left';
      } else if (style.textAlign === 'right') {
        textX = videoRight;
        ctx.textAlign = 'right';
      } else {
        ctx.textAlign = 'center';
      }

      // 绘制文字描边 - 对应 WebAV 的 strokeStyle, lineWidth, lineCap, lineJoin，使用缩放后的值
      const scaledBorderWidth = scaleSize(style.borderWidth);
      if (scaledBorderWidth > 0) {
        ctx.strokeStyle = style.borderColor;
        ctx.lineWidth = scaledBorderWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeText(line, textX, y);
      }

      // 绘制文字填充 - 对应 WebAV 的 color 和 fillStyle
      ctx.fillStyle = style.color;
      ctx.fillText(line, textX, y);
    });
  }, [currentSubtitle, style, scaleSize, scaleFactor, actualVideoDisplaySize]);


  // 当 Canvas 尺寸或字幕内容变化时重新渲染
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 设置 Canvas 物理尺寸
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    // 渲染字幕
    renderSubtitleToCanvas();
  }, [canvasSize, renderSubtitleToCanvas]);


  // 处理拖拽开始
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStartY(e.clientY);
    setDragStartOffset(style.bottomOffset);

    // 添加拖拽样式
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [style.bottomOffset]);

  // 处理拖拽移动
  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const deltaY = dragStartY - e.clientY; // 向上为正
    const containerHeight = containerDimensions.height;

    // 计算新的底部偏移量（考虑缩放因子）
    let newOffset = dragStartOffset + deltaY / scaleFactor;

    // 限制拖拽范围（20px 到容器高度的80%，使用原始尺寸）
    const minOffset = 20;
    const maxOffset = (containerHeight * 0.8) / scaleFactor;
    newOffset = Math.max(minOffset, Math.min(maxOffset, newOffset));

    onStyleChange({ ...style, bottomOffset: newOffset });
  }, [isDragging, dragStartY, dragStartOffset, style, onStyleChange, scaleFactor, containerDimensions]);

  // 处理拖拽结束
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    
    setIsDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [isDragging]);

  // 绑定全局拖拽事件
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  // 如果字幕不可见，返回空 Canvas
  if (!style.visible) {
    return null;
  }

  return (
    <div className={cn('absolute inset-0 pointer-events-none', className)}>
      {/* Canvas 字幕渲染 - 完全参考 WebAV EmbedSubtitlesClip 的实现方式 */}
      <canvas
        ref={canvasRef}
        className="absolute top-[50%] right-0 pointer-events-auto left-[50%] -translate-x-1/2 -translate-y-1/2"
        style={{
          cursor: isDragging ? 'ns-resize' : currentSubtitle ? 'ns-resize' : 'default',
          opacity: isDragging ? 0.8 : 1,
          transition: isDragging ? 'none' : 'opacity 0.2s ease',
        }}
        onMouseDown={currentSubtitle ? handleDragStart : undefined}
        title={currentSubtitle ? t('components.subtitleOverlay.dragToAdjust') : undefined}
      />
      
      {/* 拖拽提示线 */}
      {isDragging && currentSubtitle && (
        <div
          className="absolute left-0 right-0 border-t border-dashed border-primary/60 pointer-events-none"
          style={{ bottom: `${scaleSize(style.bottomOffset)}px` }}
        />
      )}
      
      {/* 拖拽辅助区域 - 增强交互体验 */}
      {!isDragging && currentSubtitle && (
        <div
          className="absolute left-1/2 transform -translate-x-1/2 w-20 h-8 opacity-0 hover:opacity-20 bg-primary rounded cursor-ns-resize pointer-events-auto transition-opacity"
          style={{ bottom: `${scaleSize(style.bottomOffset) - 16}px` }}
          onMouseDown={handleDragStart}
          title={t('components.subtitleOverlay.clickDragToAdjust')}
        />
      )}
    </div>
  );
}