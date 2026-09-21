import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DashboardSectionCardProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  href?: string;
  actionLabel?: string;
  children: React.ReactNode;
  className?: string;
};

export function DashboardSectionCard({
  title,
  description,
  href,
  actionLabel = "View all",
  children,
  className,
}: DashboardSectionCardProps) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {description ? (
          <CardDescription>{description}</CardDescription>
        ) : null}
        {href ? (
          <CardAction>
            <Link
              href={href}
              className={buttonVariants({
                variant: "ghost",
                size: "sm",
              })}
            >
              {actionLabel}
            </Link>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  );
}
