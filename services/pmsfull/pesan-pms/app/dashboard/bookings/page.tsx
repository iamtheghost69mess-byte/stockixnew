"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  Calendar, 
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

// Sample data for bookings
const bookings = [
  {
    id: "B-2023-001",
    guest: "John Smith",
    property: "Sunset Villa",
    room: "Deluxe Ocean View",
    checkIn: "2023-07-15",
    checkOut: "2023-07-20",
    status: "confirmed",
    totalAmount: 750,
    paymentStatus: "paid",
  },
  {
    id: "B-2023-002",
    guest: "Jane Doe",
    property: "Mountain Lodge",
    room: "Superior Mountain View",
    checkIn: "2023-07-18",
    checkOut: "2023-07-22",
    status: "confirmed",
    totalAmount: 480,
    paymentStatus: "partial",
  },
  {
    id: "B-2023-003",
    guest: "Robert Johnson",
    property: "Beach Resort",
    room: "Family Suite",
    checkIn: "2023-07-20",
    checkOut: "2023-07-25",
    status: "pending",
    totalAmount: 1250,
    paymentStatus: "unpaid",
  },
  {
    id: "B-2023-004",
    guest: "Emily Wilson",
    property: "Sunset Villa",
    room: "Executive Suite",
    checkIn: "2023-07-22",
    checkOut: "2023-07-24",
    status: "confirmed",
    totalAmount: 400,
    paymentStatus: "paid",
  },
  {
    id: "B-2023-005",
    guest: "Michael Brown",
    property: "City Hotel",
    room: "Standard Room",
    checkIn: "2023-07-25",
    checkOut: "2023-07-28",
    status: "cancelled",
    totalAmount: 240,
    paymentStatus: "refunded",
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

export default function BookingsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  
  // Filter bookings based on search term and filters
  const filteredBookings = bookings.filter(booking => {
    // Search filter
    const matchesSearch = 
      booking.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.guest.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.room.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Property filter
    const matchesProperty = propertyFilter === "all" || booking.property === propertyFilter;
    
    // Status filter
    const matchesStatus = statusFilter === "all" || booking.status === statusFilter;
    
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
          <h3 className="text-lg font-medium">Bookings</h3>
          <p className="text-sm text-muted-foreground">
            Manage your property bookings
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/bookings/new">
            <Plus className="mr-2 h-4 w-4" />
            New Booking
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>All Bookings</CardTitle>
            <div className="flex space-x-2">
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search bookings..."
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
                  <DropdownMenuLabel>Filter Bookings</DropdownMenuLabel>
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
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <CardDescription>
            You have {bookings.length} bookings in total
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Booking ID</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Property / Room</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBookings.map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell className="font-medium">
                    {booking.id}
                  </TableCell>
                  <TableCell>{booking.guest}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{booking.property}</div>
                      <div className="text-sm text-muted-foreground">{booking.room}</div>
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(booking.checkIn)}</TableCell>
                  <TableCell>{formatDate(booking.checkOut)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        booking.status === "confirmed"
                          ? "default"
                          : booking.status === "pending"
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {booking.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        booking.paymentStatus === "paid"
                          ? "default"
                          : booking.paymentStatus === "partial"
                          ? "secondary"
                          : booking.paymentStatus === "refunded"
                          ? "outline"
                          : "destructive"
                      }
                    >
                      {booking.paymentStatus}
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
                          <Link href={`/dashboard/bookings/${booking.id}`} className="flex items-center w-full">
                            <Eye className="mr-2 h-4 w-4" />
                            View details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Link href={`/dashboard/bookings/${booking.id}/edit`} className="flex items-center w-full">
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Cancel booking
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
