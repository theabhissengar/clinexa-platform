"use client";

import { Button } from "@/components/ui/button";

type Props = {
  total: number;
  page: number;
  pageCount: number;
  onPrev: () => void;
  onNext: () => void;
};

/** Bottom bar: ‹ left · “N items” center · › right */
export function ListPaginationBar({
  total,
  page,
  pageCount,
  onPrev,
  onNext,
}: Props) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm text-muted-foreground">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="min-w-9 px-2"
        disabled={page <= 0}
        onClick={onPrev}
        aria-label="Previous page"
      >
        ‹
      </Button>
      <span className="tabular-nums">
        {total} item{total === 1 ? "" : "s"}
        {pageCount > 1 ? (
          <span className="ml-2 text-muted-foreground/80">
            ({page + 1} of {pageCount})
          </span>
        ) : null}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="min-w-9 px-2"
        disabled={page + 1 >= pageCount}
        onClick={onNext}
        aria-label="Next page"
      >
        ›
      </Button>
    </div>
  );
}
