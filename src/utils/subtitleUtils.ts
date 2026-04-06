// 字幕渲染工具函数

import { renderTxt2ImgBitmap, ImgClip } from "@webav/av-cliper";

export interface SubtitleChunk {
  text: string;
  timestamp: [number, number]; // [开始时间, 结束时间] 单位：秒
  deleted?: boolean;
}

export interface SubtitleStyle {
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  fontFamily?: string;
  padding?: number;
  borderRadius?: number;
  textShadow?: string;
  textAlign?: "left" | "center" | "right";
  maxWidth?: number;
}

const DEFAULT_SUBTITLE_STYLE: Required<SubtitleStyle> = {
  fontSize: 32,
  color: "white",
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
  padding: 12,
  borderRadius: 6,
  textShadow: "2px 2px 4px rgba(0, 0, 0, 0.8)",
  textAlign: "center",
  maxWidth: 800,
};

/**
 * 将字幕样式对象转换为 CSS 字符串
 */
function styleToCSS(style: SubtitleStyle): string {
  const mergedStyle = { ...DEFAULT_SUBTITLE_STYLE, ...style };

  return `
    font-size: ${mergedStyle.fontSize}px;
    color: ${mergedStyle.color};
    background: ${mergedStyle.backgroundColor};
    font-family: ${mergedStyle.fontFamily};
    padding: ${mergedStyle.padding}px;
    border-radius: ${mergedStyle.borderRadius}px;
    text-shadow: ${mergedStyle.textShadow};
    text-align: ${mergedStyle.textAlign};
    max-width: ${mergedStyle.maxWidth}px;
    word-wrap: break-word;
    white-space: pre-wrap;
    box-sizing: border-box;
    display: inline-block;
  `.trim();
}

/**
 * 创建字幕图像
 */
export async function createSubtitleImage(
  text: string,
  style?: SubtitleStyle
): Promise<ImageBitmap> {
  const cssStyle = styleToCSS(style || {});
  return await renderTxt2ImgBitmap(text, cssStyle);
}

/**
 * 创建字幕图像片段
 */
export async function createSubtitleClip(
  text: string,
  style?: SubtitleStyle
): Promise<ImgClip> {
  const bitmap = await createSubtitleImage(text, style);
  return new ImgClip(bitmap);
}

/**
 * 处理字幕文本，支持自动换行
 */
export function formatSubtitleText(
  text: string,
  maxLength: number = 30
): string {
  // 如果文本长度小于最大长度，直接返回
  if (text.length <= maxLength) {
    return text;
  }

  // 按标点符号和空格分割
  const words = text.split(/(\s|[，。！？；：、])/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + word).length <= maxLength) {
      currentLine += word;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // 单词本身就超过最大长度，强制分割
        lines.push(word);
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join("\n");
}

/**
 * 计算字幕在视频中的位置
 */
export function calculateSubtitlePosition(
  videoWidth: number,
  videoHeight: number,
  subtitleWidth: number,
  subtitleHeight: number
): { x: number; y: number } {
  // 居中底部显示，留出一定边距
  const margin = Math.min(videoHeight * 0.1, 60); // 10% 或最大 60px

  return {
    x: (videoWidth - subtitleWidth) / 2,
    y: videoHeight - subtitleHeight - margin,
  };
}

/**
 * 将秒转换为微秒（WebAV 使用微秒）
 */
export function secondsToMicroseconds(seconds: number): number {
  return Math.floor(seconds * 1e6);
}

/**
 * 将微秒转换为秒
 */
export function microsecondsToSeconds(microseconds: number): number {
  return microseconds / 1e6;
}
