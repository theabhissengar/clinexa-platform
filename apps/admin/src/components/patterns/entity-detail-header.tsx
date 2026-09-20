import {
  PageHeader,
  PageHeaderActions,
  PageHeaderCopy,
  PageHeaderMeta,
  PageHeaderTitle,
} from "@/components/patterns/page-header";
import { cn } from "@/lib/utils";

type EntityDetailHeaderProps = {
  title: React.ReactNode;
  leading?: React.ReactNode;
  identifier?: React.ReactNode;
  status?: React.ReactNode;
  metadata?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

export function EntityDetailHeader({
  title,
  leading,
  identifier,
  status,
  metadata,
  actions,
  className,
}: EntityDetailHeaderProps) {
  return (
    <PageHeader className={className}>
      <PageHeaderCopy>
        {leading}
        <PageHeaderTitle>{title}</PageHeaderTitle>
        {identifier ? (
          <p className="font-mono text-caption text-muted-foreground">
            {identifier}
          </p>
        ) : null}
        {status || metadata ? (
          <PageHeaderMeta>
            {status}
            {metadata}
          </PageHeaderMeta>
        ) : null}
      </PageHeaderCopy>
      {actions ? <PageHeaderActions>{actions}</PageHeaderActions> : null}
    </PageHeader>
  );
}

export function EntityDetailLeading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("text-caption text-muted-foreground", className)}>
      {children}
    </div>
  );
}
