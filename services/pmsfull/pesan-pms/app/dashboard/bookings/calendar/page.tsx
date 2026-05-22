"use client";

import { useState } from "react";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Filter,
  Info
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Sample data for properties
const properties = [
  { id: 1, name: "Sunset Villa" },
  { id: 2, name: "Mountain Lodge" },
  { id: 3, name: "Beach Resort" },
  { id: 4, name: "City Hotel" },
  { id: 5, name: "Riverside Cottage" },
];

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
  },
  {
    id: "B-2023-002",
    guest: "Jane Doe",
    property: "Mountain Lodge",
    room: "Superior Mountain View",
    checkIn: "2023-07-18",
    checkOut: "2023-07-22",
    status: "confirmed",
  },
  {
    id: "B-2023-003",
    guest: "Robert Johnson",
    property: "Beach Resort",
    room: "Family Suite",
    checkIn: "2023-07-20",
    checkOut: "2023-07-25",
    status: "pending",
  },
  {
    id: "B-2023-004",
    guest: "Emily Wilson",
    property: "Sunset Villa",
    room: "Executive Suite",
    checkIn: "2023-07-22",
    checkOut: "2023-07-24",
    status: "confirmed",
  },
  {
    id: "B-2023-005",
    guest: "Michael Brown",
    property: "City Hotel",
    room: "Standard Room",
    checkIn: "2023-07-25",
    checkOut: "2023-07-28",
    status: "cancelled",
  },
];

// Sample data for rooms
const rooms = [
  {
    id: 1,
    name: "Deluxe Ocean View",
    property: "Sunset Villa",
  },
  {
    id: 2,
    name: "Superior Mountain View",
    property: "Mountain Lodge",
  },
  {
    id: 3,
    name: "Family Suite",
    property: "Beach Resort",
  },
  {
    id: 4,
    name: "Standard Room",
    property: "City Hotel",
  },
  {
    id: 5,
    name: "Executive Suite",
    property: "Sunset Villa",
  },
];

// Generate days for the calendar
const generateDays = (year: number, month: number) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  
  const days = [];
  
  // Add empty cells for days before the first day of the month
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push({ day: null, date: null });
  }
  
  // Add days of the month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ 
      day: i, 
      date: new Date(year, month, i),
      isToday: new Date().setHours(0, 0, 0, 0) === new Date(year, month, i).setHours(0, 0, 0, 0)
    });
  }
  
  return days;
};

// Check if a date falls within a booking period
const isDateInBooking = (date: Date, booking: any) => {
  if (!date) return false;
  
  const checkIn = new Date(booking.checkIn);
  const checkOut = new Date(booking.checkOut);
  
  return date >= checkIn && date < checkOut;
};

// Get bookings for a specific room and date
const getBookingsForRoomAndDate = (roomId: number, date: Date) => {
  if (!date) return [];
  
  const room = rooms.find(r => r.id === roomId);
  if (!room) return [];
  
  return bookings.filter(booking => 
    booking.room === room.name && 
    booking.property === room.property && 
    isDateInBooking(date, booking)
  );
};

export default function BookingCalendarPage() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [propertyFilter, setPropertyFilter] = useState("all");
  
  const days = generateDays(currentYear, currentMonth);
  const monthName = new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' });
  
  // Filter rooms based on property
  const filteredRooms = propertyFilter === "all" 
    ? rooms 
    : rooms.filter(room => room.property === propertyFilter);

  const goToPreviousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const getBookingColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 border-green-500 text-green-800';
      case 'pending':
        return 'bg-yellow-100 border-yellow-500 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 border-red-500 text-red-800';
      default:
        return 'bg-gray-100 border-gray-500 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Booking Calendar</h3>
          <p className="text-sm text-muted-foreground">
            View and manage bookings in calendar view
          </p>
        </div>
        <div className="flex space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" />
                Filter
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

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>Booking Calendar</CardTitle>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="font-medium">
                {monthName} {currentYear}
              </div>
              <Button variant="outline" size="icon" onClick={goToNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <CardDescription>
            View bookings across all rooms
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              <div className="grid grid-cols-8 gap-1 mb-2">
                <div className="font-medium p-2 bg-muted rounded-md">Room</div>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                  <div key={index} className="font-medium p-2 text-center bg-muted rounded-md">
                    {day}
                  </div>
                ))}
              </div>
              
              {/* Calendar grid */}
              <div className="space-y-1">
                {/* Days of the month header */}
                <div className="grid grid-cols-8 gap-1">
                  <div className="p-2"></div>
                  {days.slice(0, 7).map((day, index) => (
                    <div 
                      key={index} 
                      className={`p-2 text-center text-sm font-medium ${day.isToday ? 'bg-primary/10 rounded-md' : ''}`}
                    >
                      {day.day !== null ? day.day : ''}
                    </div>
                  ))}
                </div>
                
                {/* Room rows */}
                {filteredRooms.map(room => (
                  <div key={room.id} className="grid grid-cols-8 gap-1">
                    <div className="p-2 text-sm font-medium truncate">{room.name}</div>
                    {days.slice(0, 7).map((day, index) => {
                      if (day.date === null) return <div key={index} className="p-2"></div>;
                      
                      const bookingsForDay = getBookingsForRoomAndDate(room.id, day.date);
                      
                      return (
                        <div key={index} className="p-1 min-h-[60px] border rounded-md">
                          <div className="text-xs text-center text-muted-foreground mb-1">
                            {day.day}
                          </div>
                          {bookingsForDay.length > 0 ? (
                            <div className="space-y-1">
                              {bookingsForDay.map(booking => (
                                <TooltipProvider key={booking.id}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div 
                                        className={`text-xs p-1 rounded border ${getBookingColor(booking.status)} truncate cursor-pointer`}
                                      >
                                        {booking.guest}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <div className="text-xs">
                                        <p className="font-medium">{booking.guest}</p>
                                        <p>{booking.id}</p>
                                        <p>Check-in: {new Date(booking.checkIn).toLocaleDateString()}</p>
                                        <p>Check-out: {new Date(booking.checkOut).toLocaleDateString()}</p>
                                        <p>Status: {booking.status}</p>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ))}
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center">
                              <div className="w-full h-1 bg-gray-100 rounded"></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              
              {/* Legend */}
              <div className="mt-4 flex space-x-4">
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-sm bg-green-100 border border-green-500 mr-2"></div>
                  <span className="text-xs">Confirmed</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-sm bg-yellow-100 border border-yellow-500 mr-2"></div>
                  <span className="text-xs">Pending</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-sm bg-red-100 border border-red-500 mr-2"></div>
                  <span className="text-xs">Cancelled</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
