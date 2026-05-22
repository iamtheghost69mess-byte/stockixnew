"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Eye, 
  Filter, 
  MoreHorizontal, 
  Plus, 
  Search, 
  XCircle 
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Sample data for bookings
const bookings = [
  {
    id: "B-2023-001",
    guest: "John Smith",
    property: "Sunset Villa",
    room: "Deluxe Ocean View",
    checkIn: "2023-07-15",
    checkOut: "2023-07-20",
    status: "checked-in",
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
    paymentStatus: "partial",
  },
  {
    id: "B-2023-003",
    guest: "Robert Johnson",
    property: "Beach Resort",
    room: "Family Suite",
    checkIn: "2023-07-20",
    checkOut: "2023-07-25",
    status: "confirmed",
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
    paymentStatus: "paid",
  },
  {
    id: "B-2023-005",
    guest: "Michael Brown",
    property: "City Hotel",
    room: "Standard Room",
    checkIn: "2023-07-15",
    checkOut: "2023-07-18",
    status: "checked-out",
    paymentStatus: "paid",
  },
  {
    id: "B-2023-006",
    guest: "Sarah Johnson",
    property: "Sunset Villa",
    room: "Deluxe Ocean View",
    checkIn: "2023-07-10",
    checkOut: "2023-07-15",
    status: "checked-out",
    paymentStatus: "paid",
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

export default function CheckInOutPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("today");
  
  const today = new Date().toISOString().split('T')[0];
  
  // Filter bookings based on search term, property filter, and active tab
  const filteredBookings = bookings.filter(booking => {
    // Search filter
    const matchesSearch = 
      booking.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.guest.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.room.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Property filter
    const matchesProperty = propertyFilter === "all" || booking.property === propertyFilter;
    
    // Tab filter
    let matchesTab = true;
    if (activeTab === "today") {
      matchesTab = booking.checkIn === today || booking.checkOut === today;
    } else if (activeTab === "check-in") {
      matchesTab = booking.status === "confirmed";
    } else if (activeTab === "check-out") {
      matchesTab = booking.status === "checked-in";
    } else if (activeTab === "history") {
      matchesTab = booking.status === "checked-out";
    }
    
    return matchesSearch && matchesProperty && matchesTab;
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
          <h3 className="text-lg font-medium">Check-in / Check-out</h3>
          <p className="text-sm text-muted-foreground">
            Manage guest arrivals and departures
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex justify-between items-center">
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="check-in">Check-in</TabsTrigger>
            <TabsTrigger value="check-out">Check-out</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          
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
                <DropdownMenuLabel>Filter Properties</DropdownMenuLabel>
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
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <TabsContent value="today" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Today's Arrivals & Departures</CardTitle>
              <CardDescription>
                Manage check-ins and check-outs for today
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Booking ID</TableHead>
                    <TableHead>Guest</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
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
                          <div className="font-medium">{booking.room}</div>
                          <div className="text-sm text-muted-foreground">{booking.property}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {booking.checkIn === today ? formatDate(booking.checkIn) : formatDate(booking.checkOut)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={booking.checkIn === today ? "default" : "secondary"}>
                          {booking.checkIn === today ? "Check-in" : "Check-out"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            booking.status === "confirmed"
                              ? "outline"
                              : booking.status === "checked-in"
                              ? "default"
                              : "secondary"
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
                              : "destructive"
                          }
                        >
                          {booking.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-1">
                          <Button variant="outline" size="icon" asChild>
                            <Link href={`/dashboard/bookings/${booking.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          {booking.status === "confirmed" && (
                            <Button variant="outline" size="icon" className="text-green-600">
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                          )}
                          {booking.status === "checked-in" && (
                            <Button variant="outline" size="icon" className="text-blue-600">
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredBookings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-6">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <Calendar className="h-8 w-8 mb-2" />
                          <p>No arrivals or departures for today</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="check-in" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Pending Check-ins</CardTitle>
              <CardDescription>
                Guests with confirmed bookings awaiting check-in
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Booking ID</TableHead>
                    <TableHead>Guest</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Check-in Date</TableHead>
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
                          <div className="font-medium">{booking.room}</div>
                          <div className="text-sm text-muted-foreground">{booking.property}</div>
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(booking.checkIn)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            booking.paymentStatus === "paid"
                              ? "default"
                              : booking.paymentStatus === "partial"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {booking.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-1">
                          <Button variant="outline" size="icon" asChild>
                            <Link href={`/dashboard/bookings/${booking.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="outline" size="icon" className="text-green-600">
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredBookings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <Clock className="h-8 w-8 mb-2" />
                          <p>No pending check-ins</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="check-out" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Pending Check-outs</CardTitle>
              <CardDescription>
                Guests currently staying who need to check out
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Booking ID</TableHead>
                    <TableHead>Guest</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Check-out Date</TableHead>
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
                          <div className="font-medium">{booking.room}</div>
                          <div className="text-sm text-muted-foreground">{booking.property}</div>
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(booking.checkOut)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            booking.paymentStatus === "paid"
                              ? "default"
                              : booking.paymentStatus === "partial"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {booking.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-1">
                          <Button variant="outline" size="icon" asChild>
                            <Link href={`/dashboard/bookings/${booking.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="outline" size="icon" className="text-blue-600">
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredBookings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <Clock className="h-8 w-8 mb-2" />
                          <p>No pending check-outs</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Check-in/out History</CardTitle>
              <CardDescription>
                Past check-ins and check-outs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Booking ID</TableHead>
                    <TableHead>Guest</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Check-out</TableHead>
                    <TableHead>Status</TableHead>
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
                          <div className="font-medium">{booking.room}</div>
                          <div className="text-sm text-muted-foreground">{booking.property}</div>
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(booking.checkIn)}</TableCell>
                      <TableCell>{formatDate(booking.checkOut)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {booking.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="icon" asChild>
                          <Link href={`/dashboard/bookings/${booking.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredBookings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <Calendar className="h-8 w-8 mb-2" />
                          <p>No check-in/out history found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
