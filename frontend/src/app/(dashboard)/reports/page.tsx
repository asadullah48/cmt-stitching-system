"use client";
import React from "react";
import { PageHeader } from "@/components/common";

export default function ReportsPage() {
  return (
    <div>
      <PageHeader title="Reports" subtitle="P&L, export and audit reports" />
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center mt-6">
        <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-700 mb-1">Reports & Analytics</h3>
        <p className="text-sm text-gray-400">Coming soon — Phase 3</p>
        <p className="text-xs text-gray-300 mt-2">PDF/Excel exports, P&L statements, audit logs</p>
      </div>
    </div>
  );
}
