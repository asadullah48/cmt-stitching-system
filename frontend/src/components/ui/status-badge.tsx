"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { getStatusConfig } from "@/hooks/utils";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/hooks/types";

interface StatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, bg, text, dot } = getStatusConfig(status);
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 border-transparent", bg, text, className)}
    >
      <span className={cn("size-1.5 rounded-full shrink-0", dot)} />
      {label}
    </Badge>
  );
}
