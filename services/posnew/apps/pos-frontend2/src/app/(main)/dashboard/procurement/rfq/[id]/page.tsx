"use client";

import { useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Plus, Send, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { fetchLocationsList } from "@/lib/inventory-api";
import { posAddRFQResponse, posConvertRFQToPO, posFetchRFQ, posSendRFQ } from "@/lib/pos-procurement-api";
import { formatCurrency } from "@/lib/utils";

export default function RFQDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const queryClient = useQueryClient();
  const [responseDialogOpen, setResponseDialogOpen] = useState(false);
  const [conversionDialogOpen, setConversionDialogOpen] = useState(false);

  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState("");

  const [respSupplierId, setRespSupplierId] = useState("");
  const [respLineCosts, setRespLineCosts] = useState<Record<string, string>>({});
  const [respAvailableDate, setRespAvailableDate] = useState("");
  const [respNotes, setRespNotes] = useState("");

  const { data: rfqRes, isLoading } = useQuery({
    queryKey: ["procurement-rfq", id],
    queryFn: () => posFetchRFQ(id),
  });
  const rfq = rfqRes?.data;

  const { data: locationsRes } = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocationsList,
  });
  const locations = Array.isArray(locationsRes) ? locationsRes : (locationsRes as any)?.data || [];

  const sendMutation = useMutation({
    mutationFn: () => posSendRFQ(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procurement-rfq", id] });
      toast.success("RFQ marked as sent.");
    },
    onError: (err: any) => toast.error(err.message || "Failed to send RFQ."),
  });

  const addResponseMutation = useMutation({
    mutationFn: (data: any) => posAddRFQResponse(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procurement-rfq", id] });
      toast.success("Response added.");
      setResponseDialogOpen(false);
      resetResponseForm();
    },
    onError: (err: any) => toast.error(err.message || "Failed to add response."),
  });

  const convertMutation = useMutation({
    mutationFn: () => posConvertRFQToPO(id, selectedResponseId!, selectedLocationId),
    onSuccess: (res) => {
      toast.success("PO created successfully.");
      router.push(`/dashboard/procurement/purchase-orders/${res.data?._id}`);
    },
    onError: (err: any) => toast.error(err.message || "Failed to convert to PO."),
  });

  const resetResponseForm = () => {
    setRespSupplierId("");
    setRespLineCosts({});
    setRespAvailableDate("");
    setRespNotes("");
  };

  if (isLoading)
    return (
      <div className="p-8">
        <Loader2 className="mx-auto animate-spin" />
      </div>
    );
  if (!rfq) return <div className="p-8 text-center">RFQ not found.</div>;

  const handleAddResponse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!respSupplierId) return toast.error("Supplier is required.");

    const lineCosts = Object.entries(respLineCosts).map(([lineId, cost]) => ({
      rfqLineId: lineId,
      unitCost: Number(cost) || 0,
    }));

    addResponseMutation.mutate({
      supplierId: respSupplierId,
      lineCosts,
      availableDate: respAvailableDate || undefined,
      notes: respNotes,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-3xl tracking-tight">RFQ: {rfq.reference || rfq._id.slice(-6)}</h1>
            <Badge variant="outline" className="capitalize">
              {rfq.status}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            Requested on {rfq.createdAt ? new Date(rfq.createdAt).toLocaleDateString() : "Unknown date"}
          </p>
        </div>
        <div className="flex gap-2">
          {rfq.status === "draft" && (
            <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
              <Send className="mr-2 h-4 w-4" /> Send Request
            </Button>
          )}
          {(rfq.status === "sent" || rfq.status === "received") && (
            <Button onClick={() => setResponseDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Supplier Response
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Requested Items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ingredient</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rfq.lines.map((line: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      {(line.ingredient as any)?.name || line.ingredient}
                      <p className="text-muted-foreground text-xs">{(line.ingredient as any)?.unit}</p>
                    </TableCell>
                    <TableCell>{line.quantity}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{line.description || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>RFQ Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <Label className="text-muted-foreground">Expected At</Label>
              <p>{rfq.expectedAt ? new Date(rfq.expectedAt).toLocaleDateString() : "No date set"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Internal Notes</Label>
              <p className="whitespace-pre-wrap">{rfq.notes || "No notes."}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Invited Suppliers</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {(rfq.suppliers as any[]).map((s) => (
                  <Badge key={s._id} variant="secondary">
                    {s.name}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Supplier Responses</CardTitle>
          <CardDescription>Compare quotes and select the best one to create a PO.</CardDescription>
        </CardHeader>
        <CardContent>
          {rfq.responses.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground italic">No responses recorded yet.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {rfq.responses.map((resp: any) => (
                <Card key={resp._id} className={resp.isSelected ? "border-primary bg-primary/5" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{(resp.supplier as any)?.name || "Supplier"}</CardTitle>
                      {resp.isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="space-y-1">
                      {rfq.lines.map((line: any) => {
                        const cost = resp.lineCosts?.find((lc: any) => String(lc.rfqLineId) === String(line._id));
                        return (
                          <div key={line._id} className="flex justify-between text-xs">
                            <span className="max-w-[120px] text-muted-foreground text-truncate">
                              {(line.ingredient as any)?.name}
                            </span>
                            <span className="font-mono">{cost ? formatCurrency(cost.unitCost) : "—"}</span>
                          </div>
                        );
                      })}
                    </div>
                    {resp.availableDate && (
                      <div className="border-t pt-2">
                        <Label className="text-[10px] text-muted-foreground uppercase">Availability</Label>
                        <p>{new Date(resp.availableDate).toLocaleDateString()}</p>
                      </div>
                    )}
                    {resp.notes && (
                      <div className="pt-1">
                        <Label className="text-[10px] text-muted-foreground uppercase">Supplier Notes</Label>
                        <p className="line-clamp-2 text-xs">{resp.notes}</p>
                      </div>
                    )}

                    {!rfq.convertedToPurchaseOrder && rfq.status === "received" && (
                      <Button
                        className="mt-2 w-full"
                        size="sm"
                        onClick={() => {
                          setSelectedResponseId(resp._id);
                          setConversionDialogOpen(true);
                        }}
                      >
                        <ShoppingCart className="mr-2 h-3.5 w-3.5" /> Convert to PO
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Response Dialog */}
      <Dialog open={responseDialogOpen} onOpenChange={setResponseDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Supplier Response</DialogTitle>
            <DialogDescription>Enter the quoted prices for this request.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddResponse} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select value={respSupplierId} onValueChange={setRespSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier…" />
                </SelectTrigger>
                <SelectContent>
                  {(rfq.suppliers as any[]).map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Line Item Quotes (Unit Cost)</Label>
              {rfq.lines.map((line: any) => (
                <div key={line._id} className="flex items-center gap-3">
                  <span className="flex-1 truncate text-xs">{(line.ingredient as any)?.name}</span>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 w-24"
                    placeholder="0.00"
                    value={respLineCosts[line._id] || ""}
                    onChange={(e) => setRespLineCosts({ ...respLineCosts, [line._id]: e.target.value })}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Earliest Availability</Label>
              <DatePicker value={respAvailableDate} onValueChange={setRespAvailableDate} className="w-full" />
            </div>

            <div className="space-y-2">
              <Label>Response Notes</Label>
              <Textarea
                value={respNotes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRespNotes(e.target.value)}
                placeholder="Price guarantees, specific delivery terms, etc."
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={addResponseMutation.isPending}>
                {addResponseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Response
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Convert to PO Dialog */}
      <Dialog open={conversionDialogOpen} onOpenChange={setConversionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to Purchase Order</DialogTitle>
            <DialogDescription>Select the destination location for the inventory.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Delivery Location</Label>
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location…" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc: any) => (
                    <SelectItem key={loc._id} value={loc._id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConversionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => convertMutation.mutate()}
              disabled={convertMutation.isPending || !selectedLocationId}
            >
              {convertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Confirmed PO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
