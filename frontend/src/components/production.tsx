"use client";

import React, { useState } from "react";
import { productionService } from "@/hooks/services";
import { todayInputDate } from "@/hooks/utils";
import { Button, FormField, Input, Textarea } from "@/components/common";
import type { Department, ProductionSessionCreate, ProductionSession } from "@/hooks/types";

// ─── SessionForm ──────────────────────────────────────────────────────────────

interface SessionFormProps {
  orderId: string;
  department: Department;
  onSuccess: (session: ProductionSession) => void;
  onCancel: () => void;
}

export function SessionForm({ orderId, department, onSuccess, onCancel }: SessionFormProps) {
  const [sessionDate, setSessionDate] = useState(todayInputDate());
  const [machines, setMachines] = useState("1");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [durationHours, setDurationHours] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!sessionDate) e.sessionDate = "Session date is required.";
    if (!machines || parseInt(machines) < 1) e.machines = "At least 1 machine required.";
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);

    const payload: ProductionSessionCreate = {
      order_id: orderId,
      department,
      session_date: sessionDate,
      machines_used: parseInt(machines),
      start_time: startTime || undefined,
      end_time: endTime || undefined,
      duration_hours: durationHours ? parseFloat(durationHours) : undefined,
      notes: notes || undefined,
    };

    try {
      const session = await productionService.logSession(payload);
      onSuccess(session);
    } catch {
      setErrors({ form: "Failed to log session. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors.form && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-sm text-red-700">{errors.form}</p>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100">
        <span className="text-xs font-semibold text-blue-700 capitalize">{department}</span>
        <span className="text-xs text-blue-500">department session</span>
      </div>

      <FormField label="Session Date" required error={errors.sessionDate}>
        <Input
          type="date"
          value={sessionDate}
          onChange={(e) => setSessionDate(e.target.value)}
          error={!!errors.sessionDate}
        />
      </FormField>

      <FormField label="Machines Used" required error={errors.machines}>
        <Input
          type="number"
          min="1"
          max="100"
          placeholder="Number of machines"
          value={machines}
          onChange={(e) => setMachines(e.target.value)}
          error={!!errors.machines}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Start Time">
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </FormField>
        <FormField label="End Time">
          <Input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </FormField>
      </div>

      <FormField label="Duration (hours)">
        <Input
          type="number"
          step="0.5"
          min="0"
          placeholder="e.g. 8.5"
          value={durationHours}
          onChange={(e) => setDurationHours(e.target.value)}
        />
      </FormField>

      <FormField label="Notes">
        <Textarea
          placeholder="Any remarks about this session…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </FormField>

      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button type="submit" loading={loading} className="flex-1 justify-center">
          Log Session
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
