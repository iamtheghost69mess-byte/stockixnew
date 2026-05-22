"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import {
  ArrowDown,
  ArrowUp,
  BedDouble,
  Building,
  Calendar,
  CreditCard,
  DollarSign,
  Home,
  Hotel,
  Percent,
  Users
} from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

// Mock data for the dashboard
const revenueData = [
  { name: "Jan", revenue: 4000 },
  { name: "Feb", revenue: 3000 },
  { name: "Mar", revenue: 5000 },
  { name: "Apr", revenue: 4500 },
  { name: "May", revenue: 6000 },
  { name: "Jun", revenue: 8000 },
  { name: "Jul", revenue: 9500 },
];

const occupancyData = [
  { name: "Jan", occupancy: 65 },
  { name: "Feb", occupancy: 59 },
  { name: "Mar", occupancy: 80 },
  { name: "Apr", occupancy: 71 },
  { name: "May", occupancy: 85 },
  { name: "Jun", occupancy: 92 },
  { name: "Jul", occupancy: 95 },
];

const bookingSourceData = [
  { name: "Direct", value: 45 },
  { name: "OTA", value: 30 },
  { name: "Travel Agent", value: 15 },
  { name: "Corporate", value: 10 },
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

const recentBookings = [
  {
    id: "B001",
    guest: "John Smith",
    property: "Sunset Villa",
    room: "Deluxe Suite",
    checkIn: "2023-07-25",
    checkOut: "2023-07-28",
    status: "confirmed",
    amount: 750
  },
  {
    id: "B002",
    guest: "Emma Johnson",
    property: "Mountain Lodge",
    room: "Family Room",
    checkIn: "2023-07-26",
    checkOut: "2023-07-30",
    status: "checked-in",
    amount: 1200
  },
  {
    id: "B003",
    guest: "Michael Brown",
    property: "Beach Resort",
    room: "Ocean View",
    checkIn: "2023-07-27",
    checkOut: "2023-07-29",
    status: "confirmed",
    amount: 580
  },
  {
    id: "B004",
    guest: "Sarah Davis",
    property: "Sunset Villa",
    room: "Standard Room",
    checkIn: "2023-07-28",
    checkOut: "2023-08-01",
    status: "pending",
    amount: 900
  },
  {
    id: "B005",
    guest: "Robert Wilson",
    property: "Mountain Lodge",
    room: "Premium Suite",
    checkIn: "2023-07-29",
    checkOut: "2023-08-02",
    status: "confirmed",
    amount: 1450
  },
];

const upcomingCheckIns = [
  {
    id: "B002",
    guest: "Emma Johnson",
    property: "Mountain Lodge",
    room: "Family Room",
    date: "Today, 2:00 PM"
  },
  {
    id: "B003",
    guest: "Michael Brown",
    property: "Beach Resort",
    room: "Ocean View",
    date: "Tomorrow, 3:30 PM"
  },
  {
    id: "B005",
    guest: "Robert Wilson",
    property: "Mountain Lodge",
    room: "Premium Suite",
    date: "Jul 29, 1:00 PM"
  },
];

const upcomingCheckOuts = [
  {
    id: "B001",
    guest: "John Smith",
    property: "Sunset Villa",
    room: "Deluxe Suite",
    date: "Today, 11:00 AM"
  },
  {
    id: "B006",
    guest: "Lisa Anderson",
    property: "Beach Resort",
    room: "Garden View",
    date: "Tomorrow, 10:00 AM"
  },
];

export default function DashboardPage() {
  const { properties, rooms, bookings } = useAppStore();

  // Get status counts for badges
  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "bg-green-100 text-green-800";
      case "checked-in": return "bg-blue-100 text-blue-800";
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "cancelled": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Dashboard</h3>
        <p className="text-sm text-muted-foreground">
          Welcome to your property management dashboard.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0">
              <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-baseline justify-between">
              <h3 className="text-2xl font-semibold">$24,780</h3>
              <div className="flex items-center text-sm text-green-600">
                <ArrowUp className="mr-1 h-4 w-4" />
                <span>12.5%</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">+$3,540 from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0">
              <p className="text-sm font-medium text-muted-foreground">Occupancy Rate</p>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-baseline justify-between">
              <h3 className="text-2xl font-semibold">85.4%</h3>
              <div className="flex items-center text-sm text-green-600">
                <ArrowUp className="mr-1 h-4 w-4" />
                <span>4.2%</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">+5.1% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0">
              <p className="text-sm font-medium text-muted-foreground">Total Bookings</p>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-baseline justify-between">
              <h3 className="text-2xl font-semibold">156</h3>
              <div className="flex items-center text-sm text-red-600">
                <ArrowDown className="mr-1 h-4 w-4" />
                <span>2.3%</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">-4 from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0">
              <p className="text-sm font-medium text-muted-foreground">New Guests</p>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-baseline justify-between">
              <h3 className="text-2xl font-semibold">42</h3>
              <div className="flex items-center text-sm text-green-600">
                <ArrowUp className="mr-1 h-4 w-4" />
                <span>8.9%</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">+5 from last month</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
            <CardDescription>Monthly revenue for the current year</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={revenueData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0088FE" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#0088FE" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <CartesianGrid strokeDasharray="3 3" />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#0088FE"
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Occupancy Rate</CardTitle>
            <CardDescription>Monthly occupancy percentage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={occupancyData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <XAxis dataKey="name" />
                  <YAxis />
                  <CartesianGrid strokeDasharray="3 3" />
                  <Tooltip />
                  <Bar dataKey="occupancy" fill="#00C49F" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Booking Sources and Recent Bookings */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Booking Sources</CardTitle>
            <CardDescription>Distribution of booking channels</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={bookingSourceData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {bookingSourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Recent Bookings</CardTitle>
            <CardDescription>Latest booking activity across all properties</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guest</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentBookings.slice(0, 5).map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell>{booking.guest}</TableCell>
                    <TableCell>{booking.property}</TableCell>
                    <TableCell>{booking.checkIn}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(booking.status)}`}>
                        {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">${booking.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end mt-4">
              <Button variant="outline" size="sm">View All Bookings</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Check-ins and Check-outs */}
      <Card>
        <CardHeader>
          <CardTitle>Today's Activity</CardTitle>
          <CardDescription>Upcoming check-ins and check-outs</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="check-ins">
            <TabsList className="mb-4">
              <TabsTrigger value="check-ins">Check-ins</TabsTrigger>
              <TabsTrigger value="check-outs">Check-outs</TabsTrigger>
            </TabsList>
            <TabsContent value="check-ins">
              <div className="space-y-4">
                {upcomingCheckIns.map((checkin) => (
                  <div key={checkin.id} className="flex items-center justify-between border-b pb-4">
                    <div className="flex items-center space-x-4">
                      <Avatar>
                        <AvatarFallback>{checkin.guest.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{checkin.guest}</p>
                        <p className="text-xs text-muted-foreground">{checkin.property} - {checkin.room}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">{checkin.date}</p>
                      <Button variant="outline" size="sm" className="mt-1">Check In</Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="check-outs">
              <div className="space-y-4">
                {upcomingCheckOuts.map((checkout) => (
                  <div key={checkout.id} className="flex items-center justify-between border-b pb-4">
                    <div className="flex items-center space-x-4">
                      <Avatar>
                        <AvatarFallback>{checkout.guest.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{checkout.guest}</p>
                        <p className="text-xs text-muted-foreground">{checkout.property} - {checkout.room}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">{checkout.date}</p>
                      <Button variant="outline" size="sm" className="mt-1">Check Out</Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Property Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Property Performance</CardTitle>
          <CardDescription>Overview of your properties</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-primary/10 p-2">
                  <Hotel className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-medium">Sunset Villa</h4>
                  <p className="text-xs text-muted-foreground">12 rooms</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Occupancy</span>
                  <span className="font-medium">92%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Revenue</span>
                  <span className="font-medium">$12,450</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Bookings</span>
                  <span className="font-medium">78</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-primary/10 p-2">
                  <Building className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-medium">Mountain Lodge</h4>
                  <p className="text-xs text-muted-foreground">8 rooms</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Occupancy</span>
                  <span className="font-medium">78%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Revenue</span>
                  <span className="font-medium">$8,320</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Bookings</span>
                  <span className="font-medium">45</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-primary/10 p-2">
                  <Home className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-medium">Beach Resort</h4>
                  <p className="text-xs text-muted-foreground">15 rooms</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Occupancy</span>
                  <span className="font-medium">85%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Revenue</span>
                  <span className="font-medium">$15,780</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Bookings</span>
                  <span className="font-medium">62</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
