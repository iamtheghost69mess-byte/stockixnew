"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createReportSchedule, fetchReportSchedules, testSendReportSchedule } from "@/lib/pos-reports-api";

export default function ReportSchedulingSettingsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [reportType, setReportType] = useState("vat-report");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily");
  const [recipients, setRecipients] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  const schedulesQuery = useQuery({
    queryKey: ["report-schedules"],
    queryFn: fetchReportSchedules,
  });

  const createMutation = useMutation({
    mutationFn: createReportSchedule,
    onSuccess: () => {
      toast.success("Report schedule created.");
      setName("");
      setRecipients("");
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to create schedule.");
    },
  });

  const testMutation = useMutation({
    mutationFn: (scheduleId: string) => testSendReportSchedule(scheduleId),
    onSuccess: () => toast.success("Test-send dispatched."),
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Test-send failed.");
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">Report Scheduling</h1>
        <p className="mt-1 text-muted-foreground text-sm">Configure daily/weekly/monthly scheduled report deliveries.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Schedule</CardTitle>
          <CardDescription>Create automated report delivery.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Morning VAT summary" />
          </div>
          <div className="space-y-1">
            <Label>Report</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vat-report">VAT Report</SelectItem>
                <SelectItem value="sales-by-category">Sales by Category</SelectItem>
                <SelectItem value="expense-breakdown">Expense Breakdown</SelectItem>
                <SelectItem value="branch-comparison">Branch Comparison</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={(value) => setFrequency(value as "daily" | "weekly" | "monthly")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Recipients (comma-separated emails)</Label>
            <Input value={recipients} onChange={(event) => setRecipients(event.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Webhook URL</Label>
            <Input value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder="https://example.com/hooks/reports" />
          </div>
          <div className="md:col-span-2">
            <Button
              onClick={() =>
                createMutation.mutate({
                  name,
                  reportType,
                  frequency,
                  recipients: recipients
                    .split(",")
                    .map((entry) => entry.trim())
                    .filter((entry) => entry.length > 0),
                  webhookUrl,
                })
              }
              disabled={createMutation.isPending || name.trim().length === 0}
            >
              Create Schedule
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(schedulesQuery.data || []).map((schedule) => (
            <div key={schedule._id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium text-sm">{schedule.name}</p>
                <p className="text-muted-foreground text-xs">
                  {schedule.reportType} • {schedule.frequency} • next {new Date(schedule.nextRunAt).toLocaleString()}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testMutation.mutate(schedule._id)}
                disabled={testMutation.isPending}
              >
                <Send className="mr-2 size-4" />
                Test Send
              </Button>
            </div>
          ))}
          {(schedulesQuery.data || []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No schedules configured yet.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
