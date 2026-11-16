import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * 轻量抽屉：手机从底部升起，桌面居中显示。
 * 训练页只留核心操作，模式 / 提示 / 统计 / 设置都收在这里。
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/40"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[85vh] w-full flex-col rounded-t-2xl border bg-background shadow-xl sm:max-w-xl sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-medium">{title}</h2>
          <Button size="icon" variant="ghost" className="size-7" onClick={onClose} aria-label="关闭">
            <X className="size-4" />
          </Button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}
