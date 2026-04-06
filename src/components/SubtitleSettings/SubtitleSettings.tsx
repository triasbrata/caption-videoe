// 字幕设置面板组件
import { useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/contexts/LocaleProvider';
import {
  Type,
  Palette,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Eye,
  EyeOff,
  RotateCcw,
  Bold,
  Italic
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export interface SubtitleStyle {
  // 字体设置
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';

  // 颜色设置
  color: string;
  backgroundColor: string;
  borderColor: string;
  shadowColor: string;

  // 布局设置
  textAlign: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;

  // 边框和阴影
  borderWidth: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowBlur: number;

  // 背景
  backgroundOpacity: number;
  backgroundRadius: number;
  backgroundPadding: number;

  // 位置
  bottomOffset: number; // 距离底部的偏移量

  // 显示设置
  visible: boolean;
}

export const defaultSubtitleStyle: SubtitleStyle = {
  fontSize: 24,
  fontFamily: 'Arial, sans-serif',
  fontWeight: 'bold',
  fontStyle: 'normal',

  color: '#FFFFFF',
  backgroundColor: '#000000',
  borderColor: '#000000',
  shadowColor: '#000000',

  textAlign: 'center',
  lineHeight: 1.2,
  letterSpacing: 0,

  borderWidth: 1,
  shadowOffsetX: 1,
  shadowOffsetY: 1,
  shadowBlur: 2,

  backgroundOpacity: 0.8,
  backgroundRadius: 4,
  backgroundPadding: 8,

  bottomOffset: 60,

  visible: true,
};

interface SubtitleSettingsProps {
  style: SubtitleStyle;
  onStyleChange: (style: SubtitleStyle) => void;
  className?: string;
}

export function SubtitleSettings({
  style,
  onStyleChange,
  className
}: SubtitleSettingsProps) {
  const { t } = useTranslation();

  const updateStyle = useCallback((updates: Partial<SubtitleStyle>) => {
    onStyleChange({ ...style, ...updates });
  }, [style, onStyleChange]);

  const resetToDefault = useCallback(() => {
    onStyleChange(defaultSubtitleStyle);
  }, [onStyleChange]);

  const presetStyles = useMemo(() => [
    {
      name: t('components.subtitleSettings.presetClassicWhite'),
      style: {
        ...defaultSubtitleStyle,
        color: '#FFFFFF',
        borderColor: '#000000',
        borderWidth: 2,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
      }
    },
    {
      name: t('components.subtitleSettings.presetYellow'),
      style: {
        ...defaultSubtitleStyle,
        color: '#FFFF00',
        borderColor: '#000000',
        borderWidth: 1,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
      }
    },
    {
      name: t('components.subtitleSettings.presetBlackBgWhite'),
      style: {
        ...defaultSubtitleStyle,
        color: '#FFFFFF',
        backgroundColor: '#000000',
        backgroundOpacity: 0.8,
        borderWidth: 0,
      }
    },
    {
      name: t('components.subtitleSettings.presetTransparent'),
      style: {
        ...defaultSubtitleStyle,
        color: '#FFFFFF',
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        shadowBlur: 3,
        shadowOffsetX: 2,
        shadowOffsetY: 2,
      }
    }
  ], [t]);

  return (
    <div className={cn("bg-background rounded-lg", className)}>
      {/* 标题栏 */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">{t('components.subtitleSettings.title')}</span>
          <div className="flex items-center space-x-1">
            <Button
              onClick={() => updateStyle({ visible: !style.visible })}
              variant={style.visible ? "default" : "outline"}
              size="sm"
              title={style.visible ? t('components.subtitleSettings.hideSubtitle') : t('components.subtitleSettings.showSubtitle')}
            >
              {style.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            </Button>
            <Button
              onClick={resetToDefault}
              variant="outline"
              size="sm"
              title={t('components.subtitleSettings.resetToDefault')}
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* 预设样式 */}
      <div className="p-4">
        <Label className="text-sm font-medium mb-3 block">{t('components.subtitleSettings.presetStyles')}</Label>
        <div className="grid grid-cols-2 gap-2">
          {presetStyles.map((preset) => (
            <Button
              key={preset.name}
              onClick={() => onStyleChange(preset.style)}
              variant="outline"
              size="sm"
              className="justify-start"
            >
              {preset.name}
            </Button>
          ))}
        </div>
      </div>

      {/* 详细设置 */}
      <div className="p-4 space-y-6">
        {/* 字体设置 */}
        <div>
          <Label className="text-sm font-medium mb-3 flex items-center">
            <Type className="w-4 h-4 mr-2" />
            {t('components.subtitleSettings.fontSettings')}
          </Label>
          <div className="space-y-4">
            <div className="grid grid-cols-4 items-center gap-2">
              <Label htmlFor="fontSize" className="text-sm">{t('components.subtitleSettings.fontSize')}</Label>
              <Input
                id="fontSize"
                type="number"
                min="8"
                max="100"
                value={style.fontSize}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  updateStyle({ fontSize: value });
                }}
                className="col-span-2"
                placeholder="字体大小"
              />
              <span className="text-sm text-muted-foreground">px</span>
            </div>

            <div className="grid grid-cols-4 items-center gap-2">
              <Label htmlFor="fontFamily" className="text-sm">{t('components.subtitleSettings.fontFamily')}</Label>
              <Select
                value={style.fontFamily}
                onValueChange={(value) => updateStyle({ fontFamily: value })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                  <SelectItem value="'Microsoft YaHei', sans-serif">{t('components.subtitleSettings.fontMicrosoftYahei')}</SelectItem>
                  <SelectItem value="'PingFang SC', sans-serif">{t('components.subtitleSettings.fontPingFang')}</SelectItem>
                  <SelectItem value="'Source Han Sans', sans-serif">{t('components.subtitleSettings.fontSourceHanSans')}</SelectItem>
                  <SelectItem value="monospace">{t('components.subtitleSettings.fontMonospace')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-2">
              <Label className="text-sm">{t('components.subtitleSettings.fontStyle')}</Label>
              <div className="col-span-3">
                <ToggleGroup
                  type="multiple"
                  value={[
                    ...(style.fontWeight === 'bold' ? ['bold'] : []),
                    ...(style.fontStyle === 'italic' ? ['italic'] : [])
                  ]}
                  onValueChange={(values) => {
                    updateStyle({
                      fontWeight: values.includes('bold') ? 'bold' : 'normal',
                      fontStyle: values.includes('italic') ? 'italic' : 'normal'
                    });
                  }}
                >
                  <ToggleGroupItem value="bold" aria-label={t('components.subtitleSettings.bold')}>
                    <Bold className="w-4 h-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="italic" aria-label={t('components.subtitleSettings.italic')}>
                    <Italic className="w-4 h-4" />
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          </div>
        </div>

        {/* 颜色设置 */}
        <div>
          <Label className="text-sm font-medium mb-3 flex items-center">
            <Palette className="w-4 h-4 mr-2" />
            {t('components.subtitleSettings.colorSettings')}
          </Label>
          <div className="space-y-4">
            <div className="grid grid-cols-4 items-center gap-2">
              <Label className="text-sm">{t('components.subtitleSettings.textColor')}</Label>
              <input
                type="color"
                value={style.color}
                onChange={(e) => updateStyle({ color: e.target.value })}
                className="w-10 h-8 rounded border cursor-pointer"
              />
              <Input
                type="text"
                value={style.color}
                onChange={(e) => updateStyle({ color: e.target.value })}
                className="col-span-2 font-mono text-sm"
                placeholder="#FFFFFF"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-2">
              <Label className="text-sm">{t('components.subtitleSettings.backgroundColor')}</Label>
              <input
                type="color"
                value={style.backgroundColor}
                onChange={(e) => updateStyle({ backgroundColor: e.target.value })}
                className="w-10 h-8 rounded border cursor-pointer"
              />
              <Input
                type="text"
                value={style.backgroundColor}
                onChange={(e) => updateStyle({ backgroundColor: e.target.value })}
                className="col-span-2 font-mono text-sm"
                placeholder="#000000"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-2">
              <Label className="text-sm">{t('components.subtitleSettings.borderColor')}</Label>
              <input
                type="color"
                value={style.borderColor}
                onChange={(e) => updateStyle({ borderColor: e.target.value })}
                className="w-10 h-8 rounded border cursor-pointer"
              />
              <Input
                type="text"
                value={style.borderColor}
                onChange={(e) => updateStyle({ borderColor: e.target.value })}
                className="col-span-2 font-mono text-sm"
                placeholder="#000000"
              />
            </div>
          </div>
        </div>

        {/* 对齐方式 */}
        <div>
          <Label className="text-sm font-medium mb-3 block">{t('components.subtitleSettings.textAlignment')}</Label>
          <ToggleGroup
            type="single"
            value={style.textAlign}
            onValueChange={(value) => {
              if (value) {
                updateStyle({ textAlign: value as 'left' | 'center' | 'right' });
              }
            }}
          >
            <ToggleGroupItem value="left" aria-label={t('components.subtitleSettings.alignLeft')}>
              <AlignLeft className="w-4 h-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="center" aria-label={t('components.subtitleSettings.alignCenter')}>
              <AlignCenter className="w-4 h-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="right" aria-label={t('components.subtitleSettings.alignRight')}>
              <AlignRight className="w-4 h-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* 位置设置 */}
        <div>
          <Label className="text-sm font-medium mb-3 block">{t('components.subtitleSettings.positionSettings')}</Label>
          <div className="grid grid-cols-4 items-center gap-2">
            <Label htmlFor="bottomOffset" className="text-sm">{t('components.subtitleSettings.bottomDistance')}</Label>
            <Input
              id="bottomOffset"
              type="number"
              min="20"
              max="200"
              value={style.bottomOffset}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (value >= 20 && value <= 200) {
                  updateStyle({ bottomOffset: value });
                }
              }}
              className="col-span-2"
              placeholder="底部距离"
            />
            <span className="text-sm text-muted-foreground">px</span>
          </div>
        </div>

        {/* 背景透明度 */}
        <div>
          <Label className="text-sm font-medium mb-3 block">{t('components.subtitleSettings.backgroundOpacity')}</Label>
          <div className="grid grid-cols-4 items-center gap-2">
            <Label className="text-sm">{t('components.subtitleSettings.opacity')}</Label>
            <div className="col-span-2">
              <Slider
                value={[style.backgroundOpacity]}
                onValueChange={([value]) => updateStyle({ backgroundOpacity: value })}
                min={0}
                max={1}
                step={0.1}
              />
            </div>
            <span className="text-sm text-muted-foreground text-right">
              {Math.round(style.backgroundOpacity * 100)}%
            </span>
          </div>
        </div>

        {/* 阴影设置 */}
        <div>
          <Label className="text-sm font-medium mb-3 block">{t('components.subtitleSettings.shadowSettings')}</Label>
          <div className="space-y-3">
            <div className="grid grid-cols-4 items-center gap-2">
              <Label className="text-sm">{t('components.subtitleSettings.blur')}</Label>
              <div className="col-span-2">
                <Slider
                  value={[style.shadowBlur]}
                  onValueChange={([value]) => updateStyle({ shadowBlur: value })}
                  min={0}
                  max={10}
                  step={1}
                />
              </div>
              <span className="text-sm text-muted-foreground text-right">{style.shadowBlur}px</span>
            </div>

            <div className="grid grid-cols-4 items-center gap-2">
              <Label className="text-sm">{t('components.subtitleSettings.xOffset')}</Label>
              <div className="col-span-2">
                <Slider
                  value={[style.shadowOffsetX]}
                  onValueChange={([value]) => updateStyle({ shadowOffsetX: value })}
                  min={-5}
                  max={5}
                  step={1}
                />
              </div>
              <span className="text-sm text-muted-foreground text-right">{style.shadowOffsetX}px</span>
            </div>

            <div className="grid grid-cols-4 items-center gap-2">
              <Label className="text-sm">{t('components.subtitleSettings.yOffset')}</Label>
              <div className="col-span-2">
                <Slider
                  value={[style.shadowOffsetY]}
                  onValueChange={([value]) => updateStyle({ shadowOffsetY: value })}
                  min={-5}
                  max={5}
                  step={1}
                />
              </div>
              <span className="text-sm text-muted-foreground text-right">{style.shadowOffsetY}px</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}