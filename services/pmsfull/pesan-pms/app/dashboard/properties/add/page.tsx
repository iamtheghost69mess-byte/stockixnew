"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AddPropertyPage() {
  const router = useRouter();
  const { addProperty } = useAppStore();
  
  // Basic information
  const [name, setName] = useState("");
  const [type, setType] = useState<"hotel" | "homestay" | "villa" | "apartment" | "other">("hotel");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [rooms, setRooms] = useState<number>(1);
  
  // Contact information
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  
  // Additional information
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !address || !city || !country) {
      alert("Please fill in all required fields");
      return;
    }
    
    addProperty({
      name,
      type,
      address: `${address}, ${city}, ${state ? state + ', ' : ''}${country} ${zipCode}`,
      rooms,
    });
    
    router.push("/dashboard/properties");
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Add New Property</h3>
        <p className="text-sm text-muted-foreground">
          Fill in the details to add a new property to your portfolio.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <Tabs defaultValue="basic">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Property Information</CardTitle>
                <TabsList>
                  <TabsTrigger value="basic">Basic</TabsTrigger>
                  <TabsTrigger value="contact">Contact</TabsTrigger>
                  <TabsTrigger value="additional">Additional</TabsTrigger>
                </TabsList>
              </div>
              <CardDescription>
                Enter the details of your property
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              <TabsContent value="basic" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Property Name *</Label>
                  <Input 
                    id="name" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    placeholder="Sunset Villa" 
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Property Type *</Label>
                  <Select value={type} onValueChange={(value: any) => setType(value)} required>
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
                  <Label htmlFor="address">Street Address *</Label>
                  <Input 
                    id="address" 
                    value={address} 
                    onChange={(e) => setAddress(e.target.value)} 
                    placeholder="123 Beach Road" 
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input 
                      id="city" 
                      value={city} 
                      onChange={(e) => setCity(e.target.value)} 
                      placeholder="Bali" 
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State/Province</Label>
                    <Input 
                      id="state" 
                      value={state} 
                      onChange={(e) => setState(e.target.value)} 
                      placeholder="Bali" 
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="country">Country *</Label>
                    <Input 
                      id="country" 
                      value={country} 
                      onChange={(e) => setCountry(e.target.value)} 
                      placeholder="Indonesia" 
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zipCode">Postal/Zip Code</Label>
                    <Input 
                      id="zipCode" 
                      value={zipCode} 
                      onChange={(e) => setZipCode(e.target.value)} 
                      placeholder="80361" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rooms">Number of Rooms *</Label>
                  <Input 
                    id="rooms" 
                    type="number" 
                    min="1"
                    value={rooms} 
                    onChange={(e) => setRooms(parseInt(e.target.value))} 
                    required
                  />
                </div>
              </TabsContent>
              
              <TabsContent value="contact" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input 
                    id="phone" 
                    value={phone} 
                    onChange={(e) => setPhone(e.target.value)} 
                    placeholder="+62 123 456 7890" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input 
                    id="email" 
                    type="email"
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    placeholder="info@sunsetvilla.com" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input 
                    id="website" 
                    value={website} 
                    onChange={(e) => setWebsite(e.target.value)} 
                    placeholder="https://sunsetvilla.com" 
                  />
                </div>
              </TabsContent>
              
              <TabsContent value="additional" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="description">Property Description</Label>
                  <Textarea 
                    id="description" 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)} 
                    placeholder="Describe your property..." 
                    rows={5}
                  />
                </div>
              </TabsContent>
            </CardContent>
            
            <CardFooter className="flex justify-between">
              <Button variant="outline" type="button" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit">Save Property</Button>
            </CardFooter>
          </Tabs>
        </Card>
      </form>
    </div>
  );
}
