import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Pagination({ page, pageCount, makeHref }: { page: number; pageCount: number; makeHref: (p: number) => string }) {
  if (pageCount <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-between text-xs text-muted" aria-label="Pagination">
      <span>Page {page} of {pageCount}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" asChild disabled={page <= 1}>
          {page > 1 ? <Link href={makeHref(page - 1)}><ChevronLeft /> Previous</Link> : <span aria-disabled><ChevronLeft /> Previous</span>}
        </Button>
        <Button variant="secondary" size="sm" asChild disabled={page >= pageCount}>
          {page < pageCount ? <Link href={makeHref(page + 1)}>Next <ChevronRight /></Link> : <span aria-disabled>Next <ChevronRight /></span>}
        </Button>
      </div>
    </nav>
  );
}

export function paginate<T>(items: T[], page: number, size = 50) {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page), pageCount);
  return { page: p, pageCount, items: items.slice((p - 1) * size, p * size) };
}
