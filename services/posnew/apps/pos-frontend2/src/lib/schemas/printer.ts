import { z } from "zod";

export const posPrinterSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["network", "usb", "bluetooth", "epson-epos"]),
  thermalDriver: z.enum(["epson", "star", "tanca", "daruma", "brother", "custom"]),
  ipAddress: z.string().optional().or(z.literal("")),
  port: z.number(), // Make it required number for form stability
  eposUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
  usbVendorId: z.string().optional().or(z.literal("")),
  usbProductId: z.string().optional().or(z.literal("")),
  bluetoothAddress: z.string().optional().or(z.literal("")),
  location: z.string().optional().nullable(),
});

export type PosPrinterFormData = z.infer<typeof posPrinterSchema>;
