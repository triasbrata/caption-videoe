import React, { useMemo } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore } from '@/stores/themeStore';
import { useTranslation } from '@/contexts/LocaleProvider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface ThemeToggleProps {
  variant?: 'select' | 'button';
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  variant = 'button',
  className
}) => {
  const { theme, setTheme, toggleTheme } = useThemeStore();
  const { t } = useTranslation();

  const themeOptions = useMemo(() => [
    { value: 'light', label: t('components.themeToggle.light'), icon: Sun },
    { value: 'dark', label: t('components.themeToggle.dark'), icon: Moon },
    { value: 'system', label: t('components.themeToggle.system'), icon: Monitor },
  ] as const, [t]);

  if (variant === 'select') {
    return (
      <Select value={theme} onValueChange={setTheme}>
        <SelectTrigger className={className}>
          <SelectValue>
            {(() => {
              const currentOption = themeOptions.find(option => option.value === theme);
              const Icon = currentOption?.icon || Monitor;
              return (
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{currentOption?.label}</span>
                </div>
              );
            })()}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {themeOptions.map((option) => {
            const Icon = option.icon;
            return (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{option.label}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    );
  }

  // Button variant
  const currentOption = themeOptions.find(option => option.value === theme);
  const Icon = currentOption?.icon || Monitor;

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className={className}
      title={t('components.themeToggle.currentTheme', { theme: currentOption?.label || '' })}
    >
      <Icon className="h-4 w-4" />
      <span className="sr-only">{t('components.themeToggle.toggleTheme')}</span>
    </Button>
  );
};
