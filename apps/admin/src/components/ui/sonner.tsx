"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import type { CSSProperties } from "react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      duration={2300}
      visibleToasts={4}
      gap={10}
      expand={false}
      icons={{
        success: (
          <CircleCheckIcon className="size-4 text-emerald-900" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4 text-red-900" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--success-bg": "#4ade80",
          "--success-border": "#86efac",
          "--success-text": "#14532d",
          "--error-bg": "#f87171",
          "--error-border": "#fca5a5",
          "--error-text": "#7f1d1d",
        } as CSSProperties
      }
      toastOptions={{
        duration: 2300,
        classNames: {
          toast:
            "cn-toast group-[.toaster]:shadow-lg group-[.toaster]:transition-all group-[.toaster]:duration-300",
          success:
            "!bg-[#4ade80] !text-[#14532d] !border-[#86efac] [&_[data-description]]:!text-[#14532d]/85",
          error:
            "!bg-[#f87171] !text-[#7f1d1d] !border-[#fca5a5] [&_[data-description]]:!text-[#7f1d1d]/85",
          title: "text-sm font-medium",
          closeButton: "border-black/15 bg-black/5 text-current hover:bg-black/10",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
