"use client";

import { useState } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Filter, 
  Printer, 
  User,
  Users,
  Map,
  Repeat
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Sample data for properties
const properties = [
  { id: 1, name: "Sunset Villa" },
  { id: 2, name: "Mountain Lodge" },
  { id: 3, name: "Beach Resort" },
  { id: 4, name: "City Hotel" },
  { id: 5, name: "Riverside Cottage" },
];

// Sample data for guest demographics
const guestDemographics = {
  totalGuests: 385,
  newGuests: 42,
  returningGuests: 343,
  averageStay: 3.5,
  countries: [
    { country: "United States", count: 120, percentage: 31 },
    { country: "United Kingdom", count: 75, percentage: 19 },
    { country: "Australia", count: 65, percentage: 17 },
    { country: "Germany", count: 45, percentage: 12 },
    { country: "Canada", count: 35, percentage: 9 },
    { country: "Other", count: 45, percentage: 12 },
  ],
  ageGroups: [
    { group: "18-24", count: 35, percentage: 9 },
    { group: "25-34", count: 95, percentage: 25 },
    { group: "35-44", count: 120, percentage: 31 },
    { group: "45-54", count: 75, percentage: 19 },
    { group: "55-64", count: 40, percentage: 10 },
    { group: "65+", count: 20, percentage: 5 },
  ],
};

// Sample data for top guests
const topGuests = [
  { 
    id: 1, 
    name: "John Smith", 
    email: "john.smith@example.com", 
    stays: 8, 
    totalSpent: 4250, 
    lastStay: "2023-07-10", 
    country: "United States" 
  },
  { 
    id: 2, 
    name: "Jane Doe", 
    email: "jane.doe@example.com", 
    stays: 6, 
    totalSpent: 3800, 
    lastStay: "2023-06-22", 
    country: "United Kingdom" 
  },
  { 
    id: 3, 
    name: "Robert Johnson", 
    email: "robert.johnson@example.com", 
    stays: 5, 
    totalSpent: 3500, 
    lastStay: "2023-07-05", 
    country: "Australia" 
  },
  { 
    id: 4, 
    name: "Emily Wilson", 
    email: "emily.wilson@example.com", 
    stays: 4, 
    totalSpent: 2800, 
    lastStay: "2023-05-18", 
    country: "Canada" 
  },
  { 
    id: 5, 
    name: "Michael Brown", 
    email: "michael.brown@example.com", 
    stays: 4, 
    totalSpent: 2600, 
    lastStay: "2023-06-30", 
    country: "United States" 
  },
];

// Sample data for booking sources
const bookingSources = [
  { source: "Direct Website", count: 145, percentage: 38 },
  { source: "Booking.com", count: 95, percentage: 25 },
  { source: "Airbnb", count: 65, percentage: 17 },
  { source: "Expedia", count: 45, percentage: 12 },
  { source: "Travel Agents", count: 25, percentage: 6 },
  { source: "Other", count: 10, percentage: 3 },
];

export default function GuestReportPage() {
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

  // Format date to display in a more readable format
  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Guest Statistics</h3>
          <p className="text-sm text-muted-foreground">
            Analyze guest demographics and booking patterns
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

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Guests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <Users className="h-5 w-5 mr-2 text-muted-foreground" />
              <div className="text-2xl font-bold">{guestDemographics.totalGuests}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">New Guests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <User className="h-5 w-5 mr-2 text-muted-foreground" />
              <div className="text-2xl font-bold">{guestDemographics.newGuests}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Returning Guests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <Repeat className="h-5 w-5 mr-2 text-muted-foreground" />
              <div className="text-2xl font-bold">{guestDemographics.returningGuests}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Stay</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{guestDemographics.averageStay} days</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Demographics</TabsTrigger>
          <TabsTrigger value="top-guests">Top Guests</TabsTrigger>
          <TabsTrigger value="booking-sources">Booking Sources</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Guest Countries</CardTitle>
                <CardDescription>
                  Distribution of guests by country of origin
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[200px] flex items-center justify-center border-b mb-4">
                  <div className="text-center text-muted-foreground">
                    <Map className="h-8 w-8 mx-auto mb-2" />
                    <p>Country distribution chart would be displayed here</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {guestDemographics.countries.map((country, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="text-sm">{country.country}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="text-sm font-medium">{country.count}</div>
                        <div className="text-xs text-muted-foreground">({country.percentage}%)</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Age Distribution</CardTitle>
                <CardDescription>
                  Distribution of guests by age group
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[200px] flex items-center justify-center border-b mb-4">
                  <div className="text-center text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2" />
                    <p>Age distribution chart would be displayed here</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {guestDemographics.ageGroups.map((ageGroup, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="text-sm">{ageGroup.group}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="text-sm font-medium">{ageGroup.count}</div>
                        <div className="text-xs text-muted-foreground">({ageGroup.percentage}%)</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="top-guests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Guests by Number of Stays</CardTitle>
              <CardDescription>
                Guests with the most frequent stays at your properties
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-muted">
                    <tr>
                      <th scope="col" className="px-6 py-3">Guest</th>
                      <th scope="col" className="px-6 py-3">Email</th>
                      <th scope="col" className="px-6 py-3">Country</th>
                      <th scope="col" className="px-6 py-3">Stays</th>
                      <th scope="col" className="px-6 py-3">Total Spent</th>
                      <th scope="col" className="px-6 py-3">Last Stay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topGuests.map((guest, index) => (
                      <tr key={index} className="border-b">
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <Avatar>
                              <AvatarFallback>{getInitials(guest.name)}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{guest.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">{guest.email}</td>
                        <td className="px-6 py-4">{guest.country}</td>
                        <td className="px-6 py-4 font-medium">{guest.stays}</td>
                        <td className="px-6 py-4">${guest.totalSpent.toLocaleString()}</td>
                        <td className="px-6 py-4">{formatDate(guest.lastStay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="booking-sources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Booking Sources</CardTitle>
              <CardDescription>
                Distribution of bookings by reservation source
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] flex items-center justify-center border-b mb-4">
                <div className="text-center text-muted-foreground">
                  <p>Booking sources chart would be displayed here</p>
                  <p className="text-sm">Showing distribution of booking channels</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {bookingSources.map((source, index) => (
                  <div key={index} className="flex flex-col">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium">{source.source}</span>
                      <span className="text-sm">{source.percentage}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2.5">
                      <div 
                        className="bg-primary h-2.5 rounded-full" 
                        style={{ width: `${source.percentage}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-muted-foreground mt-1">{source.count} bookings</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
