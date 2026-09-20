"use client";

import { CircleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  title?: React.ReactNode;
  children?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  secondaryAction?: React.ReactNode;
  className?: string;
};

export function ErrorState({
  title = "Unable to load",
  children,
  onRetry,
  retryLabel = "Retry",
  secondaryAction,
  className,
}: ErrorStateProps) {
  return (
    <Alert variant="destructive" className={cn("items-start", className)}>
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      {children ? <AlertDescription>{children}</AlertDescription> : null}
      {onRetry || secondaryAction ? (
        <div className="col-start-2 mt-3 flex flex-wrap items-center gap-2">
          {onRetry ? (
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
          {secondaryAction}
        </div>
      ) : null}
    </Alert>
  );
}
