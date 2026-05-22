"use client";

import { useState } from "react";
import { 
  Building, 
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

// Sample data for property types
const propertyTypes = [
  {
    id: 1,
    name: "Hotel",
    description: "A commercial establishment providing lodging, meals, and other services for travelers and tourists.",
    properties: 2,
  },
  {
    id: 2,
    name: "Villa",
    description: "A large, luxurious country house with extensive grounds, typically one owned by a wealthy person.",
    properties: 1,
  },
  {
    id: 3,
    name: "Resort",
    description: "A place used for relaxation or recreation, attracting visitors for holidays or vacations.",
    properties: 1,
  },
  {
    id: 4,
    name: "Homestay",
    description: "Accommodation in a family home, typically including some meals, offered to paying guests.",
    properties: 0,
  },
  {
    id: 5,
    name: "Apartment",
    description: "A suite of rooms forming one residence, typically in a building containing a number of these.",
    properties: 0,
  },
];

export default function PropertyTypesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeDescription, setNewTypeDescription] = useState("");
  
  // Filter property types based on search term
  const filteredPropertyTypes = propertyTypes.filter(type => 
    type.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    type.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddPropertyType = () => {
    // This would normally add the property type to the database
    console.log("Adding property type:", { name: newTypeName, description: newTypeDescription });
    
    // Reset form
    setNewTypeName("");
    setNewTypeDescription("");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Property Types</h3>
          <p className="text-sm text-muted-foreground">
            Manage the types of properties you offer
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add Property Type</CardTitle>
            <CardDescription>
              Create a new property type for your accommodations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="typeName">Type Name</Label>
              <Input 
                id="typeName" 
                value={newTypeName} 
                onChange={(e) => setNewTypeName(e.target.value)} 
                placeholder="e.g., Cottage" 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="typeDescription">Description</Label>
              <Textarea 
                id="typeDescription" 
                value={newTypeDescription} 
                onChange={(e) => setNewTypeDescription(e.target.value)} 
                placeholder="Describe this property type..." 
                rows={4}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleAddPropertyType}>Add Property Type</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle>All Property Types</CardTitle>
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
              You have {propertyTypes.length} property types
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Properties</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPropertyTypes.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center">
                        <Building className="mr-2 h-4 w-4" />
                        {type.name}
                      </div>
                    </TableCell>
                    <TableCell>{type.properties}</TableCell>
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
