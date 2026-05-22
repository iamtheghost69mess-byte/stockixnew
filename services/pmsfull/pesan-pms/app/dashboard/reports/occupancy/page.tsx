"use client";

import { useState } from "react";
import { 
  Calendar as CalendarIcon, 
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

// Sample data for occupancy by month
const occupancyByMonth = [
  { month: "Jan", occupancy: 65, revenue: 12500 },
  { month: "Feb", occupancy: 70, revenue: 13200 },
  { month: "Mar", occupancy: 75, revenue: 14800 },
  { month: "Apr", occupancy: 80, revenue: 16000 },
  { month: "May", occupancy: 85, revenue: 17500 },
  { month: "Jun", occupancy: 90, revenue: 19000 },
  { month: "Jul", occupancy: 95, revenue: 21000 },
  { month: "Aug", occupancy: 98, revenue: 22500 },
  { month: "Sep", occupancy: 90, revenue: 19500 },
  { month: "Oct", occupancy: 85, revenue: 18000 },
  { month: "Nov", occupancy: 75, revenue: 15500 },
  { month: "Dec", occupancy: 80, revenue: 17000 },
];

// Sample data for occupancy by property
const occupancyByProperty = [
  { property: "Sunset Villa", occupancy: 85, rooms: 5, booked: 4 },
  { property: "Mountain Lodge", occupancy: 75, rooms: 8, booked: 6 },
  { property: "Beach Resort", occupancy: 90, rooms: 12, booked: 11 },
  { property: "City Hotel", occupancy: 65, rooms: 20, booked: 13 },
  { property: "Riverside Cottage", occupancy: 80, rooms: 3, booked: 2 },
];

// Sample data for occupancy by room type
const occupancyByRoomType = [
  { type: "Standard", occupancy: 70, rooms: 15, booked: 10 },
  { type: "Deluxe", occupancy: 85, rooms: 10, booked: 8 },
  { type: "Superior", occupancy: 90, rooms: 8, booked: 7 },
  { type: "Suite", occupancy: 95, rooms: 5, booked: 5 },
  { type: "Cottage", occupancy: 80, rooms: 3, booked: 2 },
];

export default function OccupancyReportPage() {
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

  // Calculate average occupancy
  const calculateAverageOccupancy = () => {
    if (periodFilter === "month") {
      // For month view, return the occupancy for the current month
      return occupancyByMonth[currentMonth].occupancy;
    } else {
      // For year view, calculate average across all months
      const sum = occupancyByMonth.reduce((acc, curr) => acc + curr.occupancy, 0);
      return Math.round(sum / occupancyByMonth.length);
    }
  };

  // Calculate total revenue
  const calculateTotalRevenue = () => {
    if (periodFilter === "month") {
      // For month view, return the revenue for the current month
      return occupancyByMonth[currentMonth].revenue;
    } else {
      // For year view, calculate total across all months
      return occupancyByMonth.reduce((acc, curr) => acc + curr.revenue, 0);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Occupancy Report</h3>
          <p className="text-sm text-muted-foreground">
            Analyze your property occupancy rates
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
            <CardTitle className="text-sm font-medium">Average Occupancy Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{calculateAverageOccupancy()}%</div>
            <p className="text-xs text-muted-foreground">
              {periodFilter === "month" ? monthName : "Year"} {currentYear}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${calculateTotalRevenue().toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {periodFilter === "month" ? monthName : "Year"} {currentYear}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Booking Conversion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">68%</div>
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
              <CardTitle>Occupancy Trend</CardTitle>
              <CardDescription>
                {periodFilter === "month" 
                  ? `Daily occupancy rates for ${monthName} ${currentYear}` 
                  : `Monthly occupancy rates for ${currentYear}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] flex items-center justify-center border-b">
                <div className="text-center text-muted-foreground">
                  <p>Occupancy chart would be displayed here</p>
                  <p className="text-sm">Showing occupancy trend over time</p>
                </div>
              </div>
              <div className="flex justify-between items-center pt-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Average Occupancy</p>
                  <p className="text-2xl font-bold">{calculateAverageOccupancy()}%</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Peak Occupancy</p>
                  <p className="text-2xl font-bold">98%</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Lowest Occupancy</p>
                  <p className="text-2xl font-bold">65%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-property" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Occupancy by Property</CardTitle>
              <CardDescription>
                Comparison of occupancy rates across different properties
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-muted">
                    <tr>
                      <th scope="col" className="px-6 py-3">Property</th>
                      <th scope="col" className="px-6 py-3">Total Rooms</th>
                      <th scope="col" className="px-6 py-3">Booked Rooms</th>
                      <th scope="col" className="px-6 py-3">Occupancy Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {occupancyByProperty.map((item, index) => (
                      <tr key={index} className="border-b">
                        <td className="px-6 py-4 font-medium">{item.property}</td>
                        <td className="px-6 py-4">{item.rooms}</td>
                        <td className="px-6 py-4">{item.booked}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <span className="mr-2">{item.occupancy}%</span>
                            <div className="w-24 bg-muted rounded-full h-2.5">
                              <div 
                                className="bg-primary h-2.5 rounded-full" 
                                style={{ width: `${item.occupancy}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-room-type" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Occupancy by Room Type</CardTitle>
              <CardDescription>
                Comparison of occupancy rates across different room types
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-muted">
                    <tr>
                      <th scope="col" className="px-6 py-3">Room Type</th>
                      <th scope="col" className="px-6 py-3">Total Rooms</th>
                      <th scope="col" className="px-6 py-3">Booked Rooms</th>
                      <th scope="col" className="px-6 py-3">Occupancy Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {occupancyByRoomType.map((item, index) => (
                      <tr key={index} className="border-b">
                        <td className="px-6 py-4 font-medium">{item.type}</td>
                        <td className="px-6 py-4">{item.rooms}</td>
                        <td className="px-6 py-4">{item.booked}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <span className="mr-2">{item.occupancy}%</span>
                            <div className="w-24 bg-muted rounded-full h-2.5">
                              <div 
                                className="bg-primary h-2.5 rounded-full" 
                                style={{ width: `${item.occupancy}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
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
