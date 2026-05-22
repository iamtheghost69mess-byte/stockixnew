"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  Download, 
  Eye, 
  Filter, 
  Mail, 
  MoreHorizontal, 
  Printer, 
  Search, 
  Share2 
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

// Sample data for invoices
const invoices = [
  {
    id: "INV-2023-001",
    bookingId: "B-2023-001",
    guest: "John Smith",
    property: "Sunset Villa",
    amount: 750,
    date: "2023-07-10",
    dueDate: "2023-07-15",
    status: "paid",
  },
  {
    id: "INV-2023-002",
    bookingId: "B-2023-002",
    guest: "Jane Doe",
    property: "Mountain Lodge",
    amount: 480,
    date: "2023-07-15",
    dueDate: "2023-07-18",
    status: "partially_paid",
  },
  {
    id: "INV-2023-003",
    bookingId: "B-2023-003",
    guest: "Robert Johnson",
    property: "Beach Resort",
    amount: 1250,
    date: "2023-07-18",
    dueDate: "2023-07-20",
    status: "unpaid",
  },
  {
    id: "INV-2023-004",
    bookingId: "B-2023-004",
    guest: "Emily Wilson",
    property: "Sunset Villa",
    amount: 400,
    date: "2023-07-20",
    dueDate: "2023-07-22",
    status: "paid",
  },
  {
    id: "INV-2023-005",
    bookingId: "B-2023-005",
    guest: "Michael Brown",
    property: "City Hotel",
    amount: 240,
    date: "2023-07-20",
    dueDate: "2023-07-25",
    status: "cancelled",
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

export default function InvoicesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  
  // Filter invoices based on search term and filters
  const filteredInvoices = invoices.filter(invoice => {
    // Search filter
    const matchesSearch = 
      invoice.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.bookingId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.guest.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Property filter
    const matchesProperty = propertyFilter === "all" || invoice.property === propertyFilter;
    
    // Status filter
    const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
    
    return matchesSearch && matchesProperty && matchesStatus;
  });

  // Format date to display in a more readable format
  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Invoices</h3>
          <p className="text-sm text-muted-foreground">
            Manage your invoices and receipts
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>All Invoices</CardTitle>
            <div className="flex space-x-2">
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search invoices..."
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
                  <DropdownMenuLabel>Filter Invoices</DropdownMenuLabel>
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
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="partially_paid">Partially Paid</SelectItem>
                        <SelectItem value="unpaid">Unpaid</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <CardDescription>
            You have {invoices.length} invoices in total
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Booking</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">
                    {invoice.id}
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/bookings/${invoice.bookingId}`} className="text-primary hover:underline">
                      {invoice.bookingId}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{invoice.guest}</div>
                      <div className="text-sm text-muted-foreground">{invoice.property}</div>
                    </div>
                  </TableCell>
                  <TableCell>${invoice.amount.toFixed(2)}</TableCell>
                  <TableCell>{formatDate(invoice.date)}</TableCell>
                  <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        invoice.status === "paid"
                          ? "default"
                          : invoice.status === "partially_paid"
                          ? "secondary"
                          : invoice.status === "unpaid"
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {invoice.status.replace("_", " ")}
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
                          <Link href={`/dashboard/payments/invoices/${invoice.id}`} className="flex items-center w-full">
                            <Eye className="mr-2 h-4 w-4" />
                            View invoice
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Download className="mr-2 h-4 w-4" />
                          Download PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Printer className="mr-2 h-4 w-4" />
                          Print
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                          <Mail className="mr-2 h-4 w-4" />
                          Email to guest
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Share2 className="mr-2 h-4 w-4" />
                          Share link
                        </DropdownMenuItem>
                        {invoice.status === "unpaid" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                              <Link href={`/dashboard/payments/new?invoice=${invoice.id}`} className="flex items-center w-full">
                                Record payment
                              </Link>
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filteredInvoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Download className="h-8 w-8 mb-2" />
                      <p>No invoices found</p>
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
