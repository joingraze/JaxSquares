// Loading placeholders shaped like the dashboard body: a live card, then board
// cards with their meter row. The header above is the real one (HomeHeader with
// a placeholder headline), so nothing shifts when content arrives.

import { Card, Skeleton } from "../../components/ui";

export function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your boards" className="flex flex-col gap-7 px-safe">
      <section className="flex flex-col gap-2.5">
        <Skeleton className="ml-1 h-3 w-20" />
        <Card padding="md" className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5.5 w-12 rounded-md" />
            <Skeleton className="h-4 flex-1" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-11 w-24" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-11 w-24" />
          </div>
          <Skeleton className="h-14 w-full rounded-2xl" />
        </Card>
      </section>
      <section className="flex flex-col gap-3">
        <Skeleton className="ml-1 h-3 w-24" />
        {[0, 1, 2].map((i) => (
          <Card key={i} padding="none" className="flex flex-col gap-3 py-3.5 pl-3.5 pr-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <div className="flex flex-1 flex-col gap-2.5">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
            </div>
            <div className="flex items-center gap-3 pl-[3.75rem]">
              <Skeleton className="h-2 flex-1 rounded-full" />
              <Skeleton className="h-11 w-24 rounded-[0.875rem]" />
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
