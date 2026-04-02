"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { shareLinksService, PublicStatementOut } from "@/hooks/services";
import { formatDate, formatCurrency } from "@/hooks/utils";

export default function PublicStatementPage() {
  const { token } = useParams<{ token: string }>();
  const [statement, setStatement] = useState<PublicStatementOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    shareLinksService.getPublicStatement(token)
      .then(setStatement)
      .catch(() => setError("This link is invalid or has been revoked."))
      .finally(() => setLoading(false));
  }, [token]);

  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !statement) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center max-w-md">
          <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <h1 className="text-lg font-semibold text-gray-800 mb-2">Link Not Found</h1>
          <p className="text-sm text-gray-500">{error || "This statement link is invalid or has been revoked."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 print:p-0 print:bg-white">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-[#1a2744] rounded-2xl px-6 py-5 print:rounded-none print:border-b print:border-gray-300 print:bg-white">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-white print:text-gray-900">Account Statement</h1>
              <p className="text-blue-300 text-sm mt-0.5 print:text-gray-500">CMT Stitching System</p>
            </div>
            <div className="text-right">
              <p className="text-white font-semibold print:text-gray-900">{statement.party_name}</p>
              <p className="text-blue-200 text-xs mt-0.5 print:text-gray-500">
                {formatDate(statement.date_from)} — {formatDate(statement.date_to)}
              </p>
              <p className="text-blue-300 text-xs mt-0.5 print:text-gray-400">Generated: {today}</p>
            </div>
          </div>
        </div>

        {/* Summary strip */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3 flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs text-gray-500">Total Debit:</span>
            <span className="text-sm font-bold text-red-600">PKR {formatCurrency(statement.total_debit)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-gray-500">Total Credit:</span>
            <span className="text-sm font-bold text-green-600">PKR {formatCurrency(statement.total_credit)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Outstanding:</span>
            <span className={`text-sm font-bold ${statement.outstanding_balance > 0 ? "text-orange-600" : "text-green-600"}`}>
              PKR {formatCurrency(Math.abs(statement.outstanding_balance))}
              {statement.outstanding_balance <= 0 ? " (settled)" : ""}
            </span>
          </div>
          <button
            onClick={() => window.print()}
            className="ml-auto px-3 py-1 text-xs border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 print:hidden"
          >
            Print
          </button>
        </div>

        {/* Transactions table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {statement.transactions.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              No transactions found for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800 text-white">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Date</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Description</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Ref #</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Debit</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Credit</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {statement.transactions.map((tx, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap text-xs">{formatDate(tx.transaction_date)}</td>
                      <td className="px-4 py-2.5 text-gray-700 max-w-[220px]">
                        <span className="block truncate">{tx.description || "—"}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{tx.reference_number || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                        {tx.debit != null
                          ? <span className="text-red-600 font-medium">{formatCurrency(tx.debit)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                        {tx.credit != null
                          ? <span className="text-green-600 font-medium">{formatCurrency(tx.credit)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap ${tx.running_balance >= 0 ? "text-gray-900" : "text-red-600"}`}>
                        {formatCurrency(tx.running_balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#1a2744] text-white font-bold">
                    <td className="px-4 py-3" colSpan={3}>Outstanding Balance</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-300">{formatCurrency(statement.total_debit)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-300">{formatCurrency(statement.total_credit)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-lg">
                      PKR {formatCurrency(Math.abs(statement.outstanding_balance))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-4">
          This is a read-only computer-generated statement · CMT Stitching System
        </p>
      </div>
    </div>
  );
}
