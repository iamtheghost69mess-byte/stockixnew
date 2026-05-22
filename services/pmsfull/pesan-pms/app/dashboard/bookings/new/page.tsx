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
import { ArrowLeft, Calendar, CreditCard, User } from "lucide-react";
import Link from "next/link";

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
    property: 1,
    price: 150,
  },
  {
    id: 2,
    name: "Superior Mountain View",
    property: 2,
    price: 120,
  },
  {
    id: 3,
    name: "Family Suite",
    property: 3,
    price: 250,
  },
  {
    id: 4,
    name: "Standard Room",
    property: 4,
    price: 80,
  },
  {
    id: 5,
    name: "Executive Suite",
    property: 1,
    price: 200,
  },
];

// Sample data for guests
const guests = [
  { id: 1, name: "John Smith", email: "john@example.com", phone: "+1234567890" },
  { id: 2, name: "Jane Doe", email: "jane@example.com", phone: "+1987654321" },
  { id: 3, name: "Robert Johnson", email: "robert@example.com", phone: "+1122334455" },
];

export default function NewBookingPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("details");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<string | undefined>();
  const [selectedRoom, setSelectedRoom] = useState<string | undefined>();
  const [selectedGuest, setSelectedGuest] = useState<string | undefined>();
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  
  // Filter rooms based on selected property
  const filteredRooms = selectedProperty 
    ? rooms.filter(room => room.property === parseInt(selectedProperty))
    : [];
  
  // Calculate total nights and amount
  const calculateNights = () => {
    if (!checkInDate || !checkOutDate) return 0;
    
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    const diffTime = checkOut.getTime() - checkIn.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays > 0 ? diffDays : 0;
  };
  
  const calculateAmount = () => {
    const nights = calculateNights();
    if (nights === 0 || !selectedRoom) return 0;
    
    const room = rooms.find(r => r.id === parseInt(selectedRoom));
    return room ? room.price * nights : 0;
  };
  
  const nights = calculateNights();
  const totalAmount = calculateAmount();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      router.push("/dashboard/bookings");
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="icon" asChild>
            <Link href="/dashboard/bookings">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h3 className="text-lg font-medium">New Booking</h3>
            <p className="text-sm text-muted-foreground">
              Create a new reservation
            </p>
          </div>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => router.push("/dashboard/bookings")}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Booking"}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="details">Booking Details</TabsTrigger>
          <TabsTrigger value="guest">Guest Information</TabsTrigger>
          <TabsTrigger value="payment">Payment</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Booking Details</CardTitle>
              <CardDescription>
                Enter the details for this reservation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="property">Property *</Label>
                <Select value={selectedProperty} onValueChange={setSelectedProperty}>
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
                <Label htmlFor="room">Room *</Label>
                <Select 
                  value={selectedRoom} 
                  onValueChange={setSelectedRoom}
                  disabled={!selectedProperty || filteredRooms.length === 0}
                >
                  <SelectTrigger id="room">
                    <SelectValue placeholder={
                      !selectedProperty 
                        ? "Select a property first" 
                        : filteredRooms.length === 0 
                        ? "No rooms available" 
                        : "Select room"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredRooms.map(room => (
                      <SelectItem key={room.id} value={room.id.toString()}>
                        {room.name} - ${room.price}/night
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="checkIn">Check-in Date *</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="checkIn" 
                      type="date" 
                      className="pl-10"
                      value={checkInDate}
                      onChange={(e) => setCheckInDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="checkOut">Check-out Date *</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="checkOut" 
                      type="date" 
                      className="pl-10"
                      value={checkOutDate}
                      onChange={(e) => setCheckOutDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="adults">Adults *</Label>
                  <Input 
                    id="adults" 
                    type="number" 
                    min="1" 
                    value={adults}
                    onChange={(e) => setAdults(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="children">Children</Label>
                  <Input 
                    id="children" 
                    type="number" 
                    min="0" 
                    value={children}
                    onChange={(e) => setChildren(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="specialRequests">Special Requests</Label>
                <Textarea 
                  id="specialRequests" 
                  placeholder="Enter any special requests or notes..." 
                  rows={3}
                />
              </div>
              
              {nights > 0 && selectedRoom && (
                <div className="rounded-lg border p-4 mt-4">
                  <h4 className="font-medium mb-2">Booking Summary</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Room:</span>
                      <span>{rooms.find(r => r.id === parseInt(selectedRoom))?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Check-in:</span>
                      <span>{new Date(checkInDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Check-out:</span>
                      <span>{new Date(checkOutDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Nights:</span>
                      <span>{nights}</span>
                    </div>
                    <div className="flex justify-between font-medium pt-2 border-t mt-2">
                      <span>Total Amount:</span>
                      <span>${totalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => router.push("/dashboard/bookings")}>
                Cancel
              </Button>
              <Button onClick={() => setActiveTab("guest")}>
                Next: Guest Information
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="guest" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Guest Information</CardTitle>
              <CardDescription>
                Enter or select guest details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Select Existing Guest</Label>
                <Select value={selectedGuest} onValueChange={setSelectedGuest}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a guest or enter new details" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">+ Add New Guest</SelectItem>
                    {guests.map(guest => (
                      <SelectItem key={guest.id} value={guest.id.toString()}>
                        {guest.name} ({guest.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {(!selectedGuest || selectedGuest === "new") && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="guestName">Full Name *</Label>
                    <Input id="guestName" placeholder="e.g., John Smith" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="guestEmail">Email *</Label>
                    <Input id="guestEmail" type="email" placeholder="e.g., john@example.com" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="guestPhone">Phone Number *</Label>
                    <Input id="guestPhone" placeholder="e.g., +1234567890" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="guestAddress">Address</Label>
                    <Textarea id="guestAddress" placeholder="Enter guest address..." rows={3} />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="guestId">ID/Passport Number</Label>
                    <Input id="guestId" placeholder="e.g., AB123456" />
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setActiveTab("details")}>
                Previous: Booking Details
              </Button>
              <Button onClick={() => setActiveTab("payment")}>
                Next: Payment
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="payment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payment Information</CardTitle>
              <CardDescription>
                Enter payment details for this booking
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4 mb-4">
                <h4 className="font-medium mb-2">Booking Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Room:</span>
                    <span>{selectedRoom ? rooms.find(r => r.id === parseInt(selectedRoom))?.name : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Nights:</span>
                    <span>{nights || '-'}</span>
                  </div>
                  <div className="flex justify-between font-medium pt-2 border-t mt-2">
                    <span>Total Amount:</span>
                    <span>${totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Payment Method *</Label>
                <Select defaultValue="card">
                  <SelectTrigger id="paymentMethod">
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card">Credit/Debit Card</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="transfer">Bank Transfer</SelectItem>
                    <SelectItem value="paypal">PayPal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="paymentStatus">Payment Status *</Label>
                <Select defaultValue="paid">
                  <SelectTrigger id="paymentStatus">
                    <SelectValue placeholder="Select payment status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="partial">Partially Paid</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="depositAmount">Deposit Amount ($)</Label>
                <Input id="depositAmount" type="number" min="0" step="0.01" defaultValue="0.00" />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="paymentNotes">Payment Notes</Label>
                <Textarea 
                  id="paymentNotes" 
                  placeholder="Enter any payment notes..." 
                  rows={3}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setActiveTab("guest")}>
                Previous: Guest Information
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Complete Booking"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
