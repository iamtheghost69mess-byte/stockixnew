"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building, Hotel, Home, Trash2, Edit } from "lucide-react";

export default function PropertiesPage() {
  const { properties, addProperty, deleteProperty } = useAppStore();
  const [name, setName] = useState("");
  const [type, setType] = useState<"hotel" | "homestay" | "villa" | "apartment" | "other">("hotel");
  const [address, setAddress] = useState("");
  const [rooms, setRooms] = useState<number>(1);

  const handleAddProperty = () => {
    if (!name || !address) return;
    
    addProperty({
      name,
      type,
      address,
      rooms,
    });
    
    // Reset form
    setName("");
    setType("hotel");
    setAddress("");
    setRooms(1);
  };

  const getPropertyIcon = (type: string) => {
    switch (type) {
      case "hotel":
        return <Hotel className="h-5 w-5" />;
      case "villa":
        return <Home className="h-5 w-5" />;
      default:
        return <Building className="h-5 w-5" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Properties</h3>
        <p className="text-sm text-muted-foreground">
          Manage your properties and accommodations.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add New Property</CardTitle>
            <CardDescription>
              Add a new property to your portfolio
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Property Name</Label>
              <Input 
                id="name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="Sunset Villa" 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Property Type</Label>
              <Select value={type} onValueChange={(value: any) => setType(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select property type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hotel">Hotel</SelectItem>
                  <SelectItem value="homestay">Homestay</SelectItem>
                  <SelectItem value="villa">Villa</SelectItem>
                  <SelectItem value="apartment">Apartment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input 
                id="address" 
                value={address} 
                onChange={(e) => setAddress(e.target.value)} 
                placeholder="123 Beach Road" 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rooms">Number of Rooms</Label>
              <Input 
                id="rooms" 
                type="number" 
                min="1"
                value={rooms} 
                onChange={(e) => setRooms(parseInt(e.target.value))} 
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleAddProperty}>Add Property</Button>
          </CardFooter>
        </Card>

        <div className="space-y-4">
          <h4 className="text-sm font-medium">Your Properties</h4>
          {properties.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Building className="mx-auto h-8 w-8 text-muted-foreground" />
              <h3 className="mt-2 text-sm font-medium">No properties</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Add your first property to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {properties.map((property) => (
                <Card key={property.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center">
                        <div className="mr-2 rounded-md bg-primary/10 p-2">
                          {getPropertyIcon(property.type)}
                        </div>
                        <div>
                          <CardTitle className="text-base">{property.name}</CardTitle>
                          <CardDescription className="text-xs">{property.type}</CardDescription>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button variant="ghost" size="icon">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => deleteProperty(property.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm">
                      <p className="text-muted-foreground">{property.address}</p>
                      <p className="mt-1">{property.rooms} rooms</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
