"use client";

import { useState } from "react";
import { 
  ArrowDown, 
  ArrowUp, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Filter, 
  Printer 
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Sample data for properties
const properties = [
  { id: 1, name: "Sunset Villa" },
  { id: 2, name: "Mountain Lodge" },
  { id: 3, name: "Beach Resort" },
  { id: 4, name: "City Hotel" },
  { id: 5, name: "Riverside Cottage" },
];

// Sample data for revenue by month
const revenueByMonth = [
  { month: "Jan", revenue: 12500, bookings: 25, avgPerBooking: 500 },
  { month: "Feb", revenue: 13200, bookings: 28, avgPerBooking: 471 },
  { month: "Mar", revenue: 14800, bookings: 32, avgPerBooking: 462 },
  { month: "Apr", revenue: 16000, bookings: 35, avgPerBooking: 457 },
  { month: "May", revenue: 17500, bookings: 38, avgPerBooking: 460 },
  { month: "Jun", revenue: 19000, bookings: 42, avgPerBooking: 452 },
  { month: "Jul", revenue: 21000, bookings: 45, avgPerBooking: 466 },
  { month: "Aug", revenue: 22500, bookings: 48, avgPerBooking: 468 },
  { month: "Sep", revenue: 19500, bookings: 40, avgPerBooking: 487 },
  { month: "Oct", revenue: 18000, bookings: 38, avgPerBooking: 473 },
  { month: "Nov", revenue: 15500, bookings: 32, avgPerBooking: 484 },
  { month: "Dec", revenue: 17000, bookings: 36, avgPerBooking: 472 },
];

// Sample data for revenue by property
const revenueByProperty = [
  { property: "Sunset Villa", revenue: 45000, bookings: 95, avgPerBooking: 473 },
  { property: "Mountain Lodge", revenue: 38000, bookings: 80, avgPerBooking: 475 },
  { property: "Beach Resort", revenue: 62000, bookings: 125, avgPerBooking: 496 },
  { property: "City Hotel", revenue: 52000, bookings: 120, avgPerBooking: 433 },
  { property: "Riverside Cottage", revenue: 18500, bookings: 40, avgPerBooking: 462 },
];

// Sample data for revenue by room type
const revenueByRoomType = [
  { type: "Standard", revenue: 42000, bookings: 105, avgPerBooking: 400 },
  { type: "Deluxe", revenue: 58000, bookings: 110, avgPerBooking: 527 },
  { type: "Superior", revenue: 48000, bookings: 80, avgPerBooking: 600 },
  { type: "Suite", revenue: 52000, bookings: 65, avgPerBooking: 800 },
  { type: "Cottage", revenue: 15500, bookings: 25, avgPerBooking: 620 },
];

export default function RevenueReportPage() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("month");
  const [activeTab, setActiveTab] = useState("overview");
  
  const monthName = new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' });
  
  const goToPreviousPeriod = () => {
    if (periodFilter === "month") {
      if (currentMonth === 0) {
        setCurrentMonth(11);
        setCurrentYear(currentYear - 1);
      } else {
        setCurrentMonth(currentMonth - 1);
      }
    } else if (periodFilter === "year") {
      setCurrentYear(currentYear - 1);
    }
  };

  const goToNextPeriod = () => {
    if (periodFilter === "month") {
      if (currentMonth === 11) {
        setCurrentMonth(0);
        setCurrentYear(currentYear + 1);
      } else {
        setCurrentMonth(currentMonth + 1);
      }
    } else if (periodFilter === "year") {
      setCurrentYear(currentYear + 1);
    }
  };

  // Calculate total revenue
  const calculateTotalRevenue = () => {
    if (periodFilter === "month") {
      // For month view, return the revenue for the current month
      return revenueByMonth[currentMonth].revenue;
    } else {
      // For year view, calculate total across all months
      return revenueByMonth.reduce((acc, curr) => acc + curr.revenue, 0);
    }
  };

  // Calculate total bookings
  const calculateTotalBookings = () => {
    if (periodFilter === "month") {
      // For month view, return the bookings for the current month
      return revenueByMonth[currentMonth].bookings;
    } else {
      // For year view, calculate total across all months
      return revenueByMonth.reduce((acc, curr) => acc + curr.bookings, 0);
    }
  };

  // Calculate average revenue per booking
  const calculateAvgPerBooking = () => {
    const totalRevenue = calculateTotalRevenue();
    const totalBookings = calculateTotalBookings();
    return totalBookings > 0 ? Math.round(totalRevenue / totalBookings) : 0;
  };

  // Calculate revenue change percentage
  const calculateRevenueChange = () => {
    if (periodFilter === "month") {
      // For month view, compare with previous month
      const prevMonthIndex = currentMonth === 0 ? 11 : currentMonth - 1;
      const currentRevenue = revenueByMonth[currentMonth].revenue;
      const prevRevenue = revenueByMonth[prevMonthIndex].revenue;
      return prevRevenue > 0 ? Math.round(((currentRevenue - prevRevenue) / prevRevenue) * 100) : 0;
    } else {
      // For year view, assume 5% increase from previous year
      return 5;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Revenue Report</h3>
          <p className="text-sm text-muted-foreground">
            Analyze your property revenue and financial performance
          </p>
        </div>
        <div className="flex space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Export Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Download className="mr-2 h-4 w-4" />
                Export as PDF
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Download className="mr-2 h-4 w-4" />
                Export as Excel
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Printer className="mr-2 h-4 w-4" />
                Print Report
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="year">Yearly</SelectItem>
            </SelectContent>
          </Select>
          
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="icon" onClick={goToPreviousPeriod}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="font-medium min-w-[120px] text-center">
              {periodFilter === "month" ? `${monthName} ${currentYear}` : currentYear}
            </div>
            <Button variant="outline" size="icon" onClick={goToNextPeriod}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-48">
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${calculateTotalRevenue().toLocaleString()}</div>
            <div className="flex items-center mt-1">
              <div className={`text-xs ${calculateRevenueChange() >= 0 ? 'text-green-500' : 'text-red-500'} flex items-center`}>
                {calculateRevenueChange() >= 0 ? (
                  <ArrowUp className="h-3 w-3 mr-1" />
                ) : (
                  <ArrowDown className="h-3 w-3 mr-1" />
                )}
                {Math.abs(calculateRevenueChange())}% from previous {periodFilter}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{calculateTotalBookings()}</div>
            <p className="text-xs text-muted-foreground">
              {periodFilter === "month" ? monthName : "Year"} {currentYear}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Revenue per Booking</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${calculateAvgPerBooking()}</div>
            <p className="text-xs text-muted-foreground">
              {periodFilter === "month" ? monthName : "Year"} {currentYear}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="by-property">By Property</TabsTrigger>
          <TabsTrigger value="by-room-type">By Room Type</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
              <CardDescription>
                {periodFilter === "month" 
                  ? `Daily revenue for ${monthName} ${currentYear}` 
                  : `Monthly revenue for ${currentYear}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] flex items-center justify-center border-b">
                <div className="text-center text-muted-foreground">
                  <p>Revenue chart would be displayed here</p>
                  <p className="text-sm">Showing revenue trend over time</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Total Revenue</p>
                  <p className="text-2xl font-bold">${calculateTotalRevenue().toLocaleString()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Highest Revenue Day</p>
                  <p className="text-2xl font-bold">${periodFilter === "month" ? "1,200" : "22,500"}</p>
                  <p className="text-xs text-muted-foreground">
                    {periodFilter === "month" ? "July 15" : "August"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Average Daily Revenue</p>
                  <p className="text-2xl font-bold">
                    ${periodFilter === "month" 
                      ? Math.round(revenueByMonth[currentMonth].revenue / 30).toLocaleString() 
                      : Math.round(calculateTotalRevenue() / 365).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-property" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue by Property</CardTitle>
              <CardDescription>
                Comparison of revenue across different properties
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-muted">
                    <tr>
                      <th scope="col" className="px-6 py-3">Property</th>
                      <th scope="col" className="px-6 py-3">Total Revenue</th>
                      <th scope="col" className="px-6 py-3">Bookings</th>
                      <th scope="col" className="px-6 py-3">Avg. Revenue per Booking</th>
                      <th scope="col" className="px-6 py-3">% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueByProperty.map((item, index) => (
                      <tr key={index} className="border-b">
                        <td className="px-6 py-4 font-medium">{item.property}</td>
                        <td className="px-6 py-4">${item.revenue.toLocaleString()}</td>
                        <td className="px-6 py-4">{item.bookings}</td>
                        <td className="px-6 py-4">${item.avgPerBooking}</td>
                        <td className="px-6 py-4">
                          {Math.round((item.revenue / revenueByProperty.reduce((acc, curr) => acc + curr.revenue, 0)) * 100)}%
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted">
                      <td className="px-6 py-4 font-medium">Total</td>
                      <td className="px-6 py-4 font-medium">
                        ${revenueByProperty.reduce((acc, curr) => acc + curr.revenue, 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 font-medium">
                        {revenueByProperty.reduce((acc, curr) => acc + curr.bookings, 0)}
                      </td>
                      <td className="px-6 py-4 font-medium">
                        ${Math.round(
                          revenueByProperty.reduce((acc, curr) => acc + curr.revenue, 0) / 
                          revenueByProperty.reduce((acc, curr) => acc + curr.bookings, 0)
                        )}
                      </td>
                      <td className="px-6 py-4 font-medium">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-room-type" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue by Room Type</CardTitle>
              <CardDescription>
                Comparison of revenue across different room types
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-muted">
                    <tr>
                      <th scope="col" className="px-6 py-3">Room Type</th>
                      <th scope="col" className="px-6 py-3">Total Revenue</th>
                      <th scope="col" className="px-6 py-3">Bookings</th>
                      <th scope="col" className="px-6 py-3">Avg. Revenue per Booking</th>
                      <th scope="col" className="px-6 py-3">% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueByRoomType.map((item, index) => (
                      <tr key={index} className="border-b">
                        <td className="px-6 py-4 font-medium">{item.type}</td>
                        <td className="px-6 py-4">${item.revenue.toLocaleString()}</td>
                        <td className="px-6 py-4">{item.bookings}</td>
                        <td className="px-6 py-4">${item.avgPerBooking}</td>
                        <td className="px-6 py-4">
                          {Math.round((item.revenue / revenueByRoomType.reduce((acc, curr) => acc + curr.revenue, 0)) * 100)}%
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted">
                      <td className="px-6 py-4 font-medium">Total</td>
                      <td className="px-6 py-4 font-medium">
                        ${revenueByRoomType.reduce((acc, curr) => acc + curr.revenue, 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 font-medium">
                        {revenueByRoomType.reduce((acc, curr) => acc + curr.bookings, 0)}
                      </td>
                      <td className="px-6 py-4 font-medium">
                        ${Math.round(
                          revenueByRoomType.reduce((acc, curr) => acc + curr.revenue, 0) / 
                          revenueByRoomType.reduce((acc, curr) => acc + curr.bookings, 0)
                        )}
                      </td>
                      <td className="px-6 py-4 font-medium">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
