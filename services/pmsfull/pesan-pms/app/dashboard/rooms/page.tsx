"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  BedDouble, 
  Edit, 
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

// Sample data for rooms
const rooms = [
  {
    id: 1,
    name: "Deluxe Ocean View",
    property: "Sunset Villa",
    type: "Deluxe",
    capacity: 2,
    price: 150,
    status: "available",
  },
  {
    id: 2,
    name: "Superior Mountain View",
    property: "Mountain Lodge",
    type: "Superior",
    capacity: 2,
    price: 120,
    status: "occupied",
  },
  {
    id: 3,
    name: "Family Suite",
    property: "Beach Resort",
    type: "Suite",
    capacity: 4,
    price: 250,
    status: "available",
  },
  {
    id: 4,
    name: "Standard Room",
    property: "City Hotel",
    type: "Standard",
    capacity: 2,
    price: 80,
    status: "maintenance",
  },
  {
    id: 5,
    name: "Executive Suite",
    property: "Sunset Villa",
    type: "Suite",
    capacity: 2,
    price: 200,
    status: "available",
  },
  {
    id: 6,
    name: "Cottage Room",
    property: "Riverside Cottage",
    type: "Cottage",
    capacity: 3,
    price: 130,
    status: "available",
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

export default function RoomsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  
  // Filter rooms based on search term and filters
  const filteredRooms = rooms.filter(room => {
    // Search filter
    const matchesSearch = 
      room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.property.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.type.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Property filter
    const matchesProperty = propertyFilter === "all" || room.property === propertyFilter;
    
    // Status filter
    const matchesStatus = statusFilter === "all" || room.status === statusFilter;
    
    return matchesSearch && matchesProperty && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Rooms</h3>
          <p className="text-sm text-muted-foreground">
            Manage your rooms and accommodations
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/rooms/add">
            <Plus className="mr-2 h-4 w-4" />
            Add Room
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>All Rooms</CardTitle>
            <div className="flex space-x-2">
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search rooms..."
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
                  <DropdownMenuSeparator />
                  <div className="p-2">
                    <p className="text-xs font-medium mb-2">Status</p>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="available">Available</SelectItem>
                        <SelectItem value="occupied">Occupied</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <CardDescription>
            You have {rooms.length} rooms in total
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Room Name</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRooms.map((room) => (
                <TableRow key={room.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center">
                      <BedDouble className="mr-2 h-4 w-4" />
                      {room.name}
                    </div>
                  </TableCell>
                  <TableCell>{room.property}</TableCell>
                  <TableCell>{room.type}</TableCell>
                  <TableCell>{room.capacity} guests</TableCell>
                  <TableCell>${room.price}/night</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        room.status === "available"
                          ? "default"
                          : room.status === "occupied"
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {room.status}
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
                          <Link href={`/dashboard/rooms/${room.id}`} className="flex items-center w-full">
                            View details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Link href={`/dashboard/rooms/${room.id}/edit`} className="flex items-center w-full">
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
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
