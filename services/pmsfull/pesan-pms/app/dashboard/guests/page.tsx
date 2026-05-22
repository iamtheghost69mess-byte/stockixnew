"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  Edit, 
  MoreHorizontal, 
  Plus, 
  Search, 
  Trash2, 
  User,
  UserPlus,
  Mail,
  Phone,
  MapPin,
  Calendar
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Sample data for guests
const guests = [
  {
    id: 1,
    name: "John Smith",
    email: "john.smith@example.com",
    phone: "+1 (555) 123-4567",
    address: "123 Main St, New York, NY 10001, USA",
    bookings: 3,
    lastStay: "2023-06-15",
    status: "active",
    avatar: "",
  },
  {
    id: 2,
    name: "Jane Doe",
    email: "jane.doe@example.com",
    phone: "+1 (555) 987-6543",
    address: "456 Park Ave, Los Angeles, CA 90001, USA",
    bookings: 1,
    lastStay: "2023-07-10",
    status: "active",
    avatar: "",
  },
  {
    id: 3,
    name: "Robert Johnson",
    email: "robert.johnson@example.com",
    phone: "+1 (555) 456-7890",
    address: "789 Oak St, Chicago, IL 60007, USA",
    bookings: 5,
    lastStay: "2023-05-22",
    status: "active",
    avatar: "",
  },
  {
    id: 4,
    name: "Emily Wilson",
    email: "emily.wilson@example.com",
    phone: "+1 (555) 234-5678",
    address: "321 Pine St, San Francisco, CA 94101, USA",
    bookings: 2,
    lastStay: "2023-07-05",
    status: "active",
    avatar: "",
  },
  {
    id: 5,
    name: "Michael Brown",
    email: "michael.brown@example.com",
    phone: "+1 (555) 876-5432",
    address: "654 Maple Ave, Miami, FL 33101, USA",
    bookings: 0,
    lastStay: "",
    status: "inactive",
    avatar: "",
  },
];

export default function GuestsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  
  // Filter guests based on search term
  const filteredGuests = guests.filter(guest => 
    guest.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    guest.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    guest.phone.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Format date to display in a more readable format
  const formatDate = (dateString: string) => {
    if (!dateString) return "Never";
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Guests</h3>
          <p className="text-sm text-muted-foreground">
            Manage your guest profiles and information
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/guests/add">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Guest
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>All Guests</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search guests..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <CardDescription>
            You have {guests.length} guests in total
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Bookings</TableHead>
                <TableHead>Last Stay</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGuests.map((guest) => (
                <TableRow key={guest.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center space-x-3">
                      <Avatar>
                        <AvatarImage src={guest.avatar} alt={guest.name} />
                        <AvatarFallback>{getInitials(guest.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{guest.name}</div>
                        <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                          {guest.address}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center text-sm">
                        <Mail className="mr-2 h-3 w-3 text-muted-foreground" />
                        {guest.email}
                      </div>
                      <div className="flex items-center text-sm">
                        <Phone className="mr-2 h-3 w-3 text-muted-foreground" />
                        {guest.phone}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{guest.bookings}</TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                      {formatDate(guest.lastStay)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={guest.status === "active" ? "default" : "secondary"}
                    >
                      {guest.status}
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
                          <Link href={`/dashboard/guests/${guest.id}`} className="flex items-center w-full">
                            <User className="mr-2 h-4 w-4" />
                            View profile
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Link href={`/dashboard/guests/${guest.id}/edit`} className="flex items-center w-full">
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Link href={`/dashboard/bookings/new?guest=${guest.id}`} className="flex items-center w-full">
                            <Plus className="mr-2 h-4 w-4" />
                            New booking
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
              {filteredGuests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <User className="h-8 w-8 mb-2" />
                      <p>No guests found</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
