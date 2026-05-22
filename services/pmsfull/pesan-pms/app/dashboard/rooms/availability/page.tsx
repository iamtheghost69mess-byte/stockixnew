"use client";

import { useState } from "react";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Filter
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
import { Badge } from "@/components/ui/badge";

// Sample data for properties
const properties = [
  { id: 1, name: "Sunset Villa" },
  { id: 2, name: "Mountain Lodge" },
  { id: 3, name: "Beach Resort" },
  { id: 4, name: "City Hotel" },
  { id: 5, name: "Riverside Cottage" },
];

// Sample data for rooms
const rooms = [
  {
    id: 1,
    name: "Deluxe Ocean View",
    property: "Sunset Villa",
    type: "Deluxe",
  },
  {
    id: 2,
    name: "Superior Mountain View",
    property: "Mountain Lodge",
    type: "Superior",
  },
  {
    id: 3,
    name: "Family Suite",
    property: "Beach Resort",
    type: "Suite",
  },
  {
    id: 4,
    name: "Standard Room",
    property: "City Hotel",
    type: "Standard",
  },
  {
    id: 5,
    name: "Executive Suite",
    property: "Sunset Villa",
    type: "Suite",
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

// Sample availability data
const generateAvailability = () => {
  const availability: Record<string, Record<string, string>> = {};
  
  rooms.forEach(room => {
    availability[room.id] = {};
    
    // Generate random availability for the next 30 days
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateString = date.toISOString().split('T')[0];
      
      // Random status: available, booked, blocked
      const statuses = ['available', 'booked', 'blocked'];
      const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
      
      availability[room.id][dateString] = randomStatus;
    }
  });
  
  return availability;
};

export default function RoomAvailabilityPage() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [propertyFilter, setPropertyFilter] = useState("all");
  
  const days = generateDays(currentYear, currentMonth);
  const monthName = new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' });
  const availability = generateAvailability();
  
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 border-green-500';
      case 'booked':
        return 'bg-blue-100 border-blue-500';
      case 'blocked':
        return 'bg-red-100 border-red-500';
      default:
        return 'bg-gray-100 border-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Room Availability</h3>
          <p className="text-sm text-muted-foreground">
            Manage room availability and bookings
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
              <DropdownMenuLabel>Filter Rooms</DropdownMenuLabel>
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
            <CardTitle>Availability Calendar</CardTitle>
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
            View and manage room availability
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
                    <div key={index} className="p-2 text-center text-sm font-medium">
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
                      
                      const dateString = day.date.toISOString().split('T')[0];
                      const status = availability[room.id]?.[dateString] || 'available';
                      
                      return (
                        <div 
                          key={index} 
                          className={`p-2 text-center text-xs border rounded-md ${getStatusColor(status)}`}
                        >
                          {status === 'available' ? 'A' : status === 'booked' ? 'B' : 'X'}
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
                  <span className="text-xs">Available</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-sm bg-blue-100 border border-blue-500 mr-2"></div>
                  <span className="text-xs">Booked</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-sm bg-red-100 border border-red-500 mr-2"></div>
                  <span className="text-xs">Blocked</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
