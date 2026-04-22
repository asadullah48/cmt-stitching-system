"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  keyExtractor: (row: T) => string;
}

const SKELETON_WIDTHS = ["72%", "48%", "88%", "56%", "76%", "64%", "80%"];

export function DataTable<T>({
  columns,
  data,
  loading,
  emptyMessage = "No records found",
  onRowClick,
  keyExtractor,
}: DataTableProps<T>) {
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="relative max-h-[calc(100vh-280px)] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur supports-[backdrop-filter]:bg-muted/60">
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    "px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide",
                    col.headerClassName,
                  )}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, ri) => (
                <TableRow key={ri} className="hover:bg-transparent">
                  {columns.map((col, ci) => (
                    <TableCell key={col.key} className="px-4 py-3">
                      <Skeleton
                        className="h-4"
                        style={{
                          width:
                            SKELETON_WIDTHS[
                              (ri * columns.length + ci) % SKELETON_WIDTHS.length
                            ],
                        }}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, idx) => (
                <TableRow
                  key={keyExtractor(row)}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    idx % 2 === 1 && "bg-muted/40",
                    onRowClick && "cursor-pointer hover:bg-accent",
                  )}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn("px-4 py-3 text-foreground/90", col.className)}
                    >
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? "—")}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
