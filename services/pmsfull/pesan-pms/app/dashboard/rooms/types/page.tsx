"use client";

import { useState } from "react";
import { 
  BedDouble, 
  Edit, 
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
  CardTitle,
  CardFooter
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Sample data for room types
const roomTypes = [
  {
    id: 1,
    name: "Standard",
    description: "A comfortable room with basic amenities suitable for travelers on a budget.",
    basePrice: 80,
    rooms: 5,
  },
  {
    id: 2,
    name: "Deluxe",
    description: "A spacious room with premium amenities and better views.",
    basePrice: 120,
    rooms: 3,
  },
  {
    id: 3,
    name: "Superior",
    description: "An upgraded room with additional amenities and more space.",
    basePrice: 150,
    rooms: 2,
  },
  {
    id: 4,
    name: "Suite",
    description: "A luxurious accommodation with separate living area and premium services.",
    basePrice: 200,
    rooms: 2,
  },
  {
    id: 5,
    name: "Cottage",
    description: "A standalone unit with private entrance and outdoor space.",
    basePrice: 180,
    rooms: 1,
  },
];

export default function RoomTypesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeDescription, setNewTypeDescription] = useState("");
  const [newTypeBasePrice, setNewTypeBasePrice] = useState("");
  
  // Filter room types based on search term
  const filteredRoomTypes = roomTypes.filter(type => 
    type.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    type.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddRoomType = () => {
    // This would normally add the room type to the database
    console.log("Adding room type:", { 
      name: newTypeName, 
      description: newTypeDescription,
      basePrice: parseFloat(newTypeBasePrice)
    });
    
    // Reset form
    setNewTypeName("");
    setNewTypeDescription("");
    setNewTypeBasePrice("");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Room Types</h3>
          <p className="text-sm text-muted-foreground">
            Manage the types of rooms you offer
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add Room Type</CardTitle>
            <CardDescription>
              Create a new room type for your properties
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="typeName">Type Name</Label>
              <Input 
                id="typeName" 
                value={newTypeName} 
                onChange={(e) => setNewTypeName(e.target.value)} 
                placeholder="e.g., Executive Suite" 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="typeDescription">Description</Label>
              <Textarea 
                id="typeDescription" 
                value={newTypeDescription} 
                onChange={(e) => setNewTypeDescription(e.target.value)} 
                placeholder="Describe this room type..." 
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="basePrice">Base Price per Night ($)</Label>
              <Input 
                id="basePrice" 
                type="number"
                min="0"
                step="0.01"
                value={newTypeBasePrice} 
                onChange={(e) => setNewTypeBasePrice(e.target.value)} 
                placeholder="e.g., 150.00" 
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleAddRoomType}>Add Room Type</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle>All Room Types</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search types..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <CardDescription>
              You have {roomTypes.length} room types
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Base Price</TableHead>
                  <TableHead>Rooms</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoomTypes.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center">
                        <BedDouble className="mr-2 h-4 w-4" />
                        {type.name}
                      </div>
                    </TableCell>
                    <TableCell>${type.basePrice}</TableCell>
                    <TableCell>{type.rooms}</TableCell>
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
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
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
    </div>
  );
}
