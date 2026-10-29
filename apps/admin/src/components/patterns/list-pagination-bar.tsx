"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { AppSelect } from "@/components/patterns/app-select";
import { Button } from "@/components/ui/button";

export const LIST_PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200, 500] as const;
export type ListPageSize = (typeof LIST_PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_LIST_PAGE_SIZE: ListPageSize = 10;

type ListPaginationBarProps = {
  total: number;
  page: number;
  pageCount: number;
  onPrev: () => void;
  onNext: () => void;
  /** Rows per page. When set with onPageSizeChange, shows the page-size control. */
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
};

const navButtonClassName =
  "size-9 shrink-0 text-foreground hover:bg-muted hover:text-foreground disabled:text-muted-foreground/50 [&_svg]:size-5";

/** Bottom bar: ‹ left · items + page size · › right */
export function ListPaginationBar({
  total,
  page,
  pageCount,
  onPrev,
  onNext,
  pageSize,
  onPageSizeChange,
}: ListPaginationBarProps) {
  const showPageSize =
    typeof pageSize === "number" && typeof onPageSizeChange === "function";

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm text-muted-foreground">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className={navButtonClassName}
        disabled={page <= 0}
        onClick={onPrev}
        aria-label="Previous page"
      >
        <ChevronLeft strokeWidth={2.25} />
      </Button>
      <div className="flex min-w-0 flex-wrap items-center justify-center gap-2 sm:gap-3">
        <span className="tabular-nums">
          {total} item{total === 1 ? "" : "s"}
          {pageCount > 1 ? (
            <span className="ml-2 text-muted-foreground/80">
              ({page + 1} of {pageCount})
            </span>
          ) : null}
        </span>
        {showPageSize ? (
          <div className="flex items-center gap-1.5">
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              Per page
            </span>
            <AppSelect
              size="sm"
              aria-label="Rows per page"
              className="w-19"
              value={String(pageSize)}
              onValueChange={(next) => onPageSizeChange(Number(next))}
              options={LIST_PAGE_SIZE_OPTIONS.map((size) => ({
                value: String(size),
                label: String(size),
              }))}
            />
          </div>
        ) : null}
      </div>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className={navButtonClassName}
        disabled={page + 1 >= pageCount}
        onClick={onNext}
        aria-label="Next page"
      >
        <ChevronRight strokeWidth={2.25} />
      </Button>
    </div>
  );
}
