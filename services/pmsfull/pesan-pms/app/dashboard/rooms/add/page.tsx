"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, BedDouble, Upload } from "lucide-react";
import Link from "next/link";

// Sample data for properties
const properties = [
  { id: 1, name: "Sunset Villa" },
  { id: 2, name: "Mountain Lodge" },
  { id: 3, name: "Beach Resort" },
  { id: 4, name: "City Hotel" },
  { id: 5, name: "Riverside Cottage" },
];

// Sample data for room types
const roomTypes = [
  { id: 1, name: "Standard" },
  { id: 2, name: "Deluxe" },
  { id: 3, name: "Superior" },
  { id: 4, name: "Suite" },
  { id: 5, name: "Cottage" },
];

export default function AddRoomPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("basic");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      router.push("/dashboard/rooms");
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="icon" asChild>
            <Link href="/dashboard/rooms">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h3 className="text-lg font-medium">Add New Room</h3>
            <p className="text-sm text-muted-foreground">
              Create a new room in your property
            </p>
          </div>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => router.push("/dashboard/rooms")}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Room"}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="amenities">Amenities & Features</TabsTrigger>
          <TabsTrigger value="photos">Photos</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Enter the basic details about your room
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="property">Property *</Label>
                <Select>
                  <SelectTrigger id="property">
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map(property => (
                      <SelectItem key={property.id} value={property.id.toString()}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="name">Room Name *</Label>
                <Input id="name" placeholder="e.g., Deluxe Ocean View" />
                <p className="text-xs text-muted-foreground">
                  This is how your room will be displayed to guests
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="type">Room Type *</Label>
                <Select>
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select room type" />
                  </SelectTrigger>
                  <SelectContent>
                    {roomTypes.map(type => (
                      <SelectItem key={type.id} value={type.id.toString()}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea 
                  id="description" 
                  placeholder="Describe your room..." 
                  rows={4}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="capacity">Capacity (Guests) *</Label>
                  <Input id="capacity" type="number" min="1" defaultValue="2" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="beds">Number of Beds *</Label>
                  <Input id="beds" type="number" min="1" defaultValue="1" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Price per Night ($) *</Label>
                  <Input id="price" type="number" min="0" step="0.01" defaultValue="100.00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select defaultValue="available">
                    <SelectTrigger id="status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="occupied">Occupied</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => router.push("/dashboard/rooms")}>
                Cancel
              </Button>
              <Button onClick={() => setActiveTab("amenities")}>
                Next: Amenities & Features
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="amenities" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Amenities & Features</CardTitle>
              <CardDescription>
                Add amenities and features available in this room
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Room Amenities</Label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="wifi" className="rounded border-gray-300" />
                    <label htmlFor="wifi">WiFi</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="tv" className="rounded border-gray-300" />
                    <label htmlFor="tv">TV</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="ac" className="rounded border-gray-300" />
                    <label htmlFor="ac">Air Conditioning</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="minibar" className="rounded border-gray-300" />
                    <label htmlFor="minibar">Mini Bar</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="safe" className="rounded border-gray-300" />
                    <label htmlFor="safe">Safe</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="balcony" className="rounded border-gray-300" />
                    <label htmlFor="balcony">Balcony</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="bathtub" className="rounded border-gray-300" />
                    <label htmlFor="bathtub">Bathtub</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="shower" className="rounded border-gray-300" />
                    <label htmlFor="shower">Shower</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="hairdryer" className="rounded border-gray-300" />
                    <label htmlFor="hairdryer">Hair Dryer</label>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="roomSize">Room Size (sqm)</Label>
                <Input id="roomSize" type="number" min="0" defaultValue="25" />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="view">Room View</Label>
                <Select>
                  <SelectTrigger id="view">
                    <SelectValue placeholder="Select room view" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ocean">Ocean View</SelectItem>
                    <SelectItem value="mountain">Mountain View</SelectItem>
                    <SelectItem value="garden">Garden View</SelectItem>
                    <SelectItem value="city">City View</SelectItem>
                    <SelectItem value="pool">Pool View</SelectItem>
                    <SelectItem value="none">No Specific View</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="additionalFeatures">Additional Features</Label>
                <Textarea 
                  id="additionalFeatures" 
                  placeholder="Enter any additional features..." 
                  rows={3}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setActiveTab("basic")}>
                Previous: Basic Info
              </Button>
              <Button onClick={() => setActiveTab("photos")}>
                Next: Photos
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="photos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Room Photos</CardTitle>
              <CardDescription>
                Upload photos of your room
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Main Photo</Label>
                <div className="h-64 rounded-md border border-dashed flex items-center justify-center bg-muted">
                  <div className="text-center">
                    <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">Upload Main Photo</p>
                    <p className="text-xs text-muted-foreground">
                      Drag and drop or click to browse
                    </p>
                    <Button variant="outline" size="sm" className="mt-4">
                      Select File
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Additional Photos</Label>
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((index) => (
                    <div key={index} className="h-32 rounded-md border border-dashed flex items-center justify-center bg-muted">
                      <div className="text-center">
                        <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
                        <p className="mt-1 text-xs text-muted-foreground">
                          Add Photo
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setActiveTab("amenities")}>
                Previous: Amenities
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Room"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
