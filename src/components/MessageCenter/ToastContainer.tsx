// Toast 容器组件 - 使用 Shadcn/ui Sonner
import { Toaster } from "@/components/ui/sonner";

export function ToastContainer() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      expand={true}
      visibleToasts={5}
    />
  );
}
