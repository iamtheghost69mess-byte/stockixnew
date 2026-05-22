import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Define the types for our store
interface Property {
  id: string;
  name: string;
  type: 'hotel' | 'homestay' | 'villa' | 'apartment' | 'other';
  address: string;
  rooms: number;
}

interface Room {
  id: string;
  propertyId: string;
  name: string;
  type: string;
  capacity: number;
  rate: number;
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
}

interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
}

interface Booking {
  id: string;
  propertyId: string;
  roomId: string;
  guestId: string;
  checkIn: string;
  checkOut: string;
  status: 'confirmed' | 'checked-in' | 'checked-out' | 'cancelled';
  totalAmount: number;
}

interface AppState {
  // Properties
  properties: Property[];
  selectedPropertyId: string | null;
  addProperty: (property: Omit<Property, 'id'>) => void;
  updateProperty: (id: string, property: Partial<Property>) => void;
  deleteProperty: (id: string) => void;
  selectProperty: (id: string | null) => void;
  
  // Rooms
  rooms: Room[];
  addRoom: (room: Omit<Room, 'id'>) => void;
  updateRoom: (id: string, room: Partial<Room>) => void;
  deleteRoom: (id: string) => void;
  
  // Guests
  guests: Guest[];
  addGuest: (guest: Omit<Guest, 'id'>) => void;
  updateGuest: (id: string, guest: Partial<Guest>) => void;
  deleteGuest: (id: string) => void;
  
  // Bookings
  bookings: Booking[];
  addBooking: (booking: Omit<Booking, 'id'>) => void;
  updateBooking: (id: string, booking: Partial<Booking>) => void;
  deleteBooking: (id: string) => void;
}

// Create the store
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Properties
      properties: [],
      selectedPropertyId: null,
      addProperty: (property) => 
        set((state) => ({
          properties: [...state.properties, { ...property, id: crypto.randomUUID() }]
        })),
      updateProperty: (id, property) => 
        set((state) => ({
          properties: state.properties.map(p => 
            p.id === id ? { ...p, ...property } : p
          )
        })),
      deleteProperty: (id) => 
        set((state) => ({
          properties: state.properties.filter(p => p.id !== id)
        })),
      selectProperty: (id) => 
        set(() => ({
          selectedPropertyId: id
        })),
      
      // Rooms
      rooms: [],
      addRoom: (room) => 
        set((state) => ({
          rooms: [...state.rooms, { ...room, id: crypto.randomUUID() }]
        })),
      updateRoom: (id, room) => 
        set((state) => ({
          rooms: state.rooms.map(r => 
            r.id === id ? { ...r, ...room } : r
          )
        })),
      deleteRoom: (id) => 
        set((state) => ({
          rooms: state.rooms.filter(r => r.id !== id)
        })),
      
      // Guests
      guests: [],
      addGuest: (guest) => 
        set((state) => ({
          guests: [...state.guests, { ...guest, id: crypto.randomUUID() }]
        })),
      updateGuest: (id, guest) => 
        set((state) => ({
          guests: state.guests.map(g => 
            g.id === id ? { ...g, ...guest } : g
          )
        })),
      deleteGuest: (id) => 
        set((state) => ({
          guests: state.guests.filter(g => g.id !== id)
        })),
      
      // Bookings
      bookings: [],
      addBooking: (booking) => 
        set((state) => ({
          bookings: [...state.bookings, { ...booking, id: crypto.randomUUID() }]
        })),
      updateBooking: (id, booking) => 
        set((state) => ({
          bookings: state.bookings.map(b => 
            b.id === id ? { ...b, ...booking } : b
          )
        })),
      deleteBooking: (id) => 
        set((state) => ({
          bookings: state.bookings.filter(b => b.id !== id)
        })),
    }),
    {
      name: 'pesan-pms-storage',
    }
  )
);
