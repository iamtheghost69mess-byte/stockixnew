"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  CreditCard, 
  Download, 
  Edit, 
  Eye, 
  Filter, 
  MoreHorizontal, 
  Plus, 
  Search, 
  Trash2 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

// Sample data for payments
const payments = [
  {
    id: "P-2023-001",
    bookingId: "B-2023-001",
    guest: "John Smith",
    property: "Sunset Villa",
    amount: 750,
    method: "credit_card",
    date: "2023-07-10",
    status: "completed",
    type: "booking",
  },
  {
    id: "P-2023-002",
    bookingId: "B-2023-002",
    guest: "Jane Doe",
    property: "Mountain Lodge",
    amount: 240,
    method: "bank_transfer",
    date: "2023-07-15",
    status: "completed",
    type: "deposit",
  },
  {
    id: "P-2023-003",
    bookingId: "B-2023-002",
    guest: "Jane Doe",
    property: "Mountain Lodge",
    amount: 240,
    method: "cash",
    date: "2023-07-22",
    status: "pending",
    type: "balance",
  },
  {
    id: "P-2023-004",
    bookingId: "B-2023-003",
    guest: "Robert Johnson",
    property: "Beach Resort",
    amount: 1250,
    method: "paypal",
    date: "2023-07-18",
    status: "completed",
    type: "booking",
  },
  {
    id: "P-2023-005",
    bookingId: "B-2023-005",
    guest: "Michael Brown",
    property: "City Hotel",
    amount: 240,
    method: "credit_card",
    date: "2023-07-20",
    status: "refunded",
    type: "refund",
  },
];

// Sample data for properties
const properties = [
  { id: 1, name: "Sunset Villa" },
  { id: 2, name: "Mountain Lodge" },
  { id: 3, name: "Beach Resort" },
  { id: 4, name: "City Hotel" },
  { id: 5, name: "Riverside Cottage" },
];

export default function PaymentsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  
  // Filter payments based on search term and filters
  const filteredPayments = payments.filter(payment => {
    // Search filter
    const matchesSearch = 
      payment.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.bookingId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.guest.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Property filter
    const matchesProperty = propertyFilter === "all" || payment.property === propertyFilter;
    
    // Status filter
    const matchesStatus = statusFilter === "all" || payment.status === statusFilter;
    
    // Method filter
    const matchesMethod = methodFilter === "all" || payment.method === methodFilter;
    
    return matchesSearch && matchesProperty && matchesStatus && matchesMethod;
  });

  // Format date to display in a more readable format
  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  // Format payment method to display in a more readable format
  const formatMethod = (method: string) => {
    switch (method) {
      case "credit_card":
        return "Credit Card";
      case "bank_transfer":
        return "Bank Transfer";
      case "cash":
        return "Cash";
      case "paypal":
        return "PayPal";
      default:
        return method;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Payments</h3>
          <p className="text-sm text-muted-foreground">
            Manage your payment transactions
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/payments/new">
            <Plus className="mr-2 h-4 w-4" />
            New Payment
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>All Payments</CardTitle>
            <div className="flex space-x-2">
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search payments..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Filter className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Filter Payments</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="p-2">
                    <p className="text-xs font-medium mb-2">Property</p>
                    <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select property" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Properties</SelectItem>
                        {properties.map(property => (
                          <SelectItem key={property.id} value={property.name}>
                            {property.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <DropdownMenuSeparator />
                  <div className="p-2">
                    <p className="text-xs font-medium mb-2">Status</p>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="refunded">Refunded</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <DropdownMenuSeparator />
                  <div className="p-2">
                    <p className="text-xs font-medium mb-2">Payment Method</p>
                    <Select value={methodFilter} onValueChange={setMethodFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Methods</SelectItem>
                        <SelectItem value="credit_card">Credit Card</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="paypal">PayPal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <CardDescription>
            You have {payments.length} payment transactions in total
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment ID</TableHead>
                <TableHead>Booking</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="font-medium">
                    {payment.id}
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/bookings/${payment.bookingId}`} className="text-primary hover:underline">
                      {payment.bookingId}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{payment.guest}</div>
                      <div className="text-sm text-muted-foreground">{payment.property}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">${payment.amount.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground capitalize">{payment.type}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <CreditCard className="mr-2 h-4 w-4 text-muted-foreground" />
                      {formatMethod(payment.method)}
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(payment.date)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        payment.status === "completed"
                          ? "default"
                          : payment.status === "pending"
                          ? "secondary"
                          : payment.status === "refunded"
                          ? "outline"
                          : "destructive"
                      }
                    >
                      {payment.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem>
                          <Link href={`/dashboard/payments/${payment.id}`} className="flex items-center w-full">
                            <Eye className="mr-2 h-4 w-4" />
                            View details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Link href={`/dashboard/payments/invoices/${payment.id}`} className="flex items-center w-full">
                            <Download className="mr-2 h-4 w-4" />
                            Download receipt
                          </Link>
                        </DropdownMenuItem>
                        {payment.status === "pending" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit payment
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Cancel payment
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filteredPayments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <CreditCard className="h-8 w-8 mb-2" />
                      <p>No payments found</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
