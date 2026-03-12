"use client";

import React, { useEffect, useState } from "react";
import { settingsService } from "@/hooks/services";
import { useToast } from "@/hooks/toast";
import { useAuth } from "@/hooks/store";
import type { AppSettings } from "@/hooks/types";

export default function SettingsPage() {
  const { showToast } = useToast();
  const { role } = useAuth();
  const [form, setForm] = useState<AppSettings>({
    business_name: "",
    owner_name: "",
    no_bill_alert_days: 3,
    goods_on_hold_alert_days: 5,
    outstanding_alert_days: 30,
    rate_deviation_pct: 10,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isAdmin = role === "admin";

  useEffect(() => {
    settingsService
      .get()
      .then(setForm)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSaving(true);
    try {
      await settingsService.update(form);
      showToast("Settings saved successfully", "success");
    } catch {
      showToast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: keyof AppSettings, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Page Header */}
      <div className="bg-[#1a2744] rounded-2xl px-6 py-5">
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-sm text-blue-300 mt-0.5">
          Business configuration and smart alert thresholds
        </p>
      </div>

      {/* Admin-only warning */}
      {!isAdmin && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>
            <span className="font-semibold">View only.</span> Only admins can edit settings.
          </span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Business Info */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Business Info</h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Name
            </label>
            <input
              type="text"
              value={form.business_name}
              onChange={(e) => setField("business_name", e.target.value)}
              disabled={!isAdmin}
              placeholder="e.g. CMT Stitching & Packing"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Shown in the dashboard header and printed documents.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Owner / Manager Name
            </label>
            <input
              type="text"
              value={form.owner_name}
              onChange={(e) => setField("owner_name", e.target.value)}
              disabled={!isAdmin}
              placeholder="e.g. Asad"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Displayed alongside the business name in the dashboard header.
            </p>
          </div>
        </div>

        {/* Alert Thresholds */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                Smart Alert Thresholds
              </h2>
            </div>
            <p className="text-xs text-gray-400 mt-1 ml-6">
              Control when the dashboard shows warnings. Adjust as you learn your patterns.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                key: "no_bill_alert_days" as keyof AppSettings,
                label: "Packed but not billed",
                unit: "days",
                hint: "Warn when an order reaches packing_complete status but has no bill for more than this many days.",
              },
              {
                key: "goods_on_hold_alert_days" as keyof AppSettings,
                label: "Goods on hold (pending)",
                unit: "days",
                hint: "Warn when an order stays in 'pending' status without any production progress for more than this many days.",
              },
              {
                key: "outstanding_alert_days" as keyof AppSettings,
                label: "Outstanding payment overdue",
                unit: "days",
                hint: "Warn when a bill remains unpaid or partially paid for more than this many days.",
              },
              {
                key: "rate_deviation_pct" as keyof AppSettings,
                label: "Stitch rate deviation",
                unit: "%",
                hint: "Warn when an order's stitch rate differs from the party's recent average by more than this percentage.",
              },
            ].map(({ key, label, unit, hint }) => (
              <div key={key} className="flex items-start gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                  </label>
                  <p className="text-xs text-gray-400">{hint}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <input
                    type="number"
                    min="1"
                    max={unit === "%" ? 100 : 365}
                    value={form[key] as number}
                    onChange={(e) =>
                      setField(key, parseInt(e.target.value) || 1)
                    }
                    disabled={!isAdmin}
                    className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                  />
                  <span className="text-sm text-gray-500 w-8">{unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Save button — admin only */}
        {isAdmin && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Changes take effect immediately on the dashboard.
            </p>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving…
                </span>
              ) : (
                "Save Settings"
              )}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
