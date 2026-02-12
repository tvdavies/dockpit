import { toast } from "sonner";

export interface Toast {
  message: string;
  url?: string;
  duration?: number;
}

export function addToast({ message, url, duration = 8000 }: Toast) {
  if (url) {
    toast(message, {
      duration,
      description: url,
      action: {
        label: "Open",
        onClick: () => window.open(url, "_blank"),
      },
    });
  } else {
    toast(message, { duration });
  }
}
