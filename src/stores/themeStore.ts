import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// 检测系统主题
const getSystemTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

// 解析主题
const resolveTheme = (theme: Theme): "light" | "dark" => {
  if (theme === "system") {
    return getSystemTheme();
  }
  return theme;
};

// 应用主题到 DOM
const applyTheme = (theme: "light" | "dark") => {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.add("light");
  }
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "light", // 默认使用 light 而不是 system
      resolvedTheme: "light",

      setTheme: (theme: Theme) => {
        const resolvedTheme = resolveTheme(theme);
        applyTheme(resolvedTheme);
        set({ theme, resolvedTheme });
      },

      toggleTheme: () => {
        const { theme } = get();
        if (theme === "system") {
          // 从 system 切换到与当前系统主题相反的主题
          const systemTheme = getSystemTheme();
          const newTheme = systemTheme === "dark" ? "light" : "dark";
          get().setTheme(newTheme);
        } else {
          // 在 light 和 dark 之间切换
          const newTheme = theme === "light" ? "dark" : "light";
          get().setTheme(newTheme);
        }
      },
    }),
    {
      name: "theme-storage",
      onRehydrateStorage: () => (state) => {
        if (state) {
          // 重新应用主题
          const resolvedTheme = resolveTheme(state.theme);
          applyTheme(resolvedTheme);
          state.resolvedTheme = resolvedTheme;
        } else {
          // 首次访问时确保应用默认主题
          applyTheme("light");
        }
      },
    }
  )
);

// 监听系统主题变化
if (typeof window !== "undefined") {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  const handleChange = () => {
    const { theme, setTheme } = useThemeStore.getState();
    if (theme === "system") {
      setTheme("system"); // 重新解析 system 主题
    }
  };

  mediaQuery.addEventListener("change", handleChange);
}
