declare module "@point-of-sale/receipt-printer-encoder" {
  type Align = "left" | "center" | "right";
  type EncoderOptions = { columns?: number };

  export default class ReceiptPrinterEncoder {
    constructor(options?: EncoderOptions);
    initialize(): this;
    align(align: Align): this;
    bold(v?: boolean): this;
    line(text?: string): this;
    cut(): this;
    encode(): Uint8Array;
  }
}

interface BluetoothRemoteGATTCharacteristic {
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: BluetoothServiceUUID): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice {
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
}

interface BluetoothRequestDeviceOptions {
  acceptAllDevices?: boolean;
  optionalServices?: BluetoothServiceUUID[];
}

interface Bluetooth {
  requestDevice(options?: BluetoothRequestDeviceOptions): Promise<BluetoothDevice>;
  getDevices?(): Promise<BluetoothDevice[]>;
}

interface Navigator {
  bluetooth?: Bluetooth;
}
