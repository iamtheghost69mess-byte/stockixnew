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
import { ArrowLeft, CreditCard, Search, User } from "lucide-react";
import Link from "next/link";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// Sample data for bookings
const bookings = [
  {
    id: "B-2023-001",
    guest: "John Smith",
    property: "Sunset Villa",
    room: "Deluxe Ocean View",
    checkIn: "2023-07-15",
    checkOut: "2023-07-20",
    totalAmount: 750,
    balanceDue: 0,
    status: "confirmed",
  },
  {
    id: "B-2023-002",
    guest: "Jane Doe",
    property: "Mountain Lodge",
    room: "Superior Mountain View",
    checkIn: "2023-07-18",
    checkOut: "2023-07-22",
    totalAmount: 480,
    balanceDue: 240,
    status: "confirmed",
  },
  {
    id: "B-2023-003",
    guest: "Robert Johnson",
    property: "Beach Resort",
    room: "Family Suite",
    checkIn: "2023-07-20",
    checkOut: "2023-07-25",
    totalAmount: 1250,
    balanceDue: 1250,
    status: "pending",
  },
];

// Sample data for guests
const guests = [
  { id: 1, name: "John Smith", email: "john@example.com" },
  { id: 2, name: "Jane Doe", email: "jane@example.com" },
  { id: 3, name: "Robert Johnson", email: "robert@example.com" },
  { id: 4, name: "Emily Wilson", email: "emily@example.com" },
  { id: 5, name: "Michael Brown", email: "michael@example.com" },
];

export default function NewPaymentPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentType, setPaymentType] = useState("booking");
  const [selectedBooking, setSelectedBooking] = useState<string | undefined>();
  const [selectedGuest, setSelectedGuest] = useState<string | undefined>();
  const [paymentMethod, setPaymentMethod] = useState("credit_card");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  
  // Get booking details if selected
  const selectedBookingDetails = selectedBooking 
    ? bookings.find(booking => booking.id === selectedBooking)
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      router.push("/dashboard/payments");
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="icon" asChild>
            <Link href="/dashboard/payments">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h3 className="text-lg font-medium">New Payment</h3>
            <p className="text-sm text-muted-foreground">
              Record a new payment transaction
            </p>
          </div>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => router.push("/dashboard/payments")}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Processing..." : "Process Payment"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Payment Details</CardTitle>
            <CardDescription>
              Enter the payment information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Payment Type</Label>
              <RadioGroup 
                value={paymentType} 
                onValueChange={setPaymentType}
                className="flex flex-col space-y-1"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="booking" id="booking" />
                  <Label htmlFor="booking">Booking Payment</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="deposit" id="deposit" />
                  <Label htmlFor="deposit">Deposit</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="balance" id="balance" />
                  <Label htmlFor="balance">Balance Payment</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="extra" id="extra" />
                  <Label htmlFor="extra">Extra Charges</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="refund" id="refund" />
                  <Label htmlFor="refund">Refund</Label>
                </div>
              </RadioGroup>
            </div>
            
            {paymentType !== "extra" && (
              <div className="space-y-2">
                <Label htmlFor="booking">Select Booking</Label>
                <Select value={selectedBooking} onValueChange={setSelectedBooking}>
                  <SelectTrigger id="booking">
                    <SelectValue placeholder="Select a booking" />
                  </SelectTrigger>
                  <SelectContent>
                    {bookings.map(booking => (
                      <SelectItem key={booking.id} value={booking.id}>
                        {booking.id} - {booking.guest} ({booking.property})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {paymentType === "extra" && (
              <div className="space-y-2">
                <Label htmlFor="guest">Select Guest</Label>
                <Select value={selectedGuest} onValueChange={setSelectedGuest}>
                  <SelectTrigger id="guest">
                    <SelectValue placeholder="Select a guest" />
                  </SelectTrigger>
                  <SelectContent>
                    {guests.map(guest => (
                      <SelectItem key={guest.id} value={guest.id.toString()}>
                        {guest.name} ({guest.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {selectedBookingDetails && (
              <div className="rounded-lg border p-4 mt-4">
                <h4 className="font-medium mb-2">Booking Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Guest:</span>
                    <span>{selectedBookingDetails.guest}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Property:</span>
                    <span>{selectedBookingDetails.property}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Room:</span>
                    <span>{selectedBookingDetails.room}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Check-in:</span>
                    <span>{new Date(selectedBookingDetails.checkIn).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Check-out:</span>
                    <span>{new Date(selectedBookingDetails.checkOut).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between font-medium pt-2 border-t mt-2">
                    <span>Total Amount:</span>
                    <span>${selectedBookingDetails.totalAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-primary">
                    <span>Balance Due:</span>
                    <span>${selectedBookingDetails.balanceDue.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="amount">Amount ($) *</Label>
              <Input 
                id="amount" 
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="paymentMethod">
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {paymentMethod === "credit_card" && (
              <div className="space-y-4 p-4 border rounded-lg">
                <div className="space-y-2">
                  <Label htmlFor="cardNumber">Card Number *</Label>
                  <Input 
                    id="cardNumber" 
                    placeholder="•••• •••• •••• ••••" 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="expiryDate">Expiry Date *</Label>
                    <Input 
                      id="expiryDate" 
                      placeholder="MM/YY" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cvv">CVV *</Label>
                    <Input 
                      id="cvv" 
                      placeholder="•••" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cardholderName">Cardholder Name *</Label>
                  <Input 
                    id="cardholderName" 
                    placeholder="Name on card" 
                  />
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea 
                id="notes" 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any additional information about this payment..." 
                rows={3}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Processing..." : "Process Payment"}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Summary</CardTitle>
            <CardDescription>
              Review payment details before processing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <CreditCard className="h-8 w-8 mr-3 text-primary" />
                  <div>
                    <h4 className="font-medium">Payment Information</h4>
                    <p className="text-sm text-muted-foreground">Transaction details</p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payment Type:</span>
                  <span className="font-medium capitalize">{paymentType}</span>
                </div>
                
                {selectedBookingDetails && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Booking:</span>
                    <span className="font-medium">{selectedBookingDetails.id}</span>
                  </div>
                )}
                
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Guest:</span>
                  <span className="font-medium">
                    {selectedBookingDetails?.guest || 
                     (selectedGuest ? guests.find(g => g.id.toString() === selectedGuest)?.name : "-")}
                  </span>
                </div>
                
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payment Method:</span>
                  <span className="font-medium capitalize">
                    {paymentMethod.replace("_", " ")}
                  </span>
                </div>
                
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-medium">{new Date().toLocaleDateString()}</span>
                </div>
                
                <div className="flex justify-between text-sm pt-3 border-t mt-3">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-medium text-lg">
                    ${amount ? parseFloat(amount).toFixed(2) : "0.00"}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="rounded-lg border p-4">
              <h4 className="font-medium mb-3">Payment Receipt</h4>
              <p className="text-sm text-muted-foreground mb-4">
                A receipt will be automatically generated after the payment is processed.
              </p>
              <div className="flex items-center justify-between text-sm">
                <span>Send receipt to guest</span>
                <input type="checkbox" className="rounded border-gray-300" defaultChecked />
              </div>
            </div>
            
            <div className="rounded-lg bg-muted p-4">
              <div className="flex items-center">
                <User className="h-5 w-5 mr-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  This payment will be recorded in the system and reflected in the guest's booking balance.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
