"use client";
import React from "react";
import { PageHeader } from "@/components/common";

export default function InventoryPage() {
  return (
    <div>
      <PageHeader title="Inventory" subtitle="Stock and materials management" />
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center mt-6">
        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-700 mb-1">Inventory Management</h3>
        <p className="text-sm text-gray-400">Coming soon — Phase 2</p>
        <p className="text-xs text-gray-300 mt-2">Track fabric, thread, accessories and raw materials</p>
      </div>
    </div>
  );
}
