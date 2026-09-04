import * as React from "react";

import { Card, CardSub, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("grid min-h-[12rem] place-items-center text-center", className)}>
      <div className="max-w-xs space-y-1">
        <CardTitle>{title}</CardTitle>
        <CardSub>{children}</CardSub>
        {action ? <div className="pt-3">{action}</div> : null}
      </div>
    </Card>
  );
}
