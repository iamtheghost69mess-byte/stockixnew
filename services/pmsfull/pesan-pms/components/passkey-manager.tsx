"use client";

import { useState, useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Fingerprint, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Passkey = {
  id: string;
  name: string | null;
  deviceType: string;
  createdAt: Date | null;
};

export function PasskeyManager() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passkeyName, setPasskeyName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  // Check if browser supports WebAuthn
  useEffect(() => {
    setIsSupported(
      typeof window !== "undefined" &&
      !!window.PublicKeyCredential
    );
  }, []);

  // Fetch user's passkeys
  const fetchPasskeys = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/passkeys");
      if (!response.ok) {
        throw new Error("Failed to fetch passkeys");
      }
      const data = await response.json();
      setPasskeys(data.passkeys || []);
    } catch (err) {
      console.error("Error fetching passkeys:", err);
      setError("Failed to load passkeys. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPasskeys();
  }, []);

  const handleAddPasskey = async () => {
    setIsAdding(true);
    setError("");
    setSuccess("");

    try {
      const result = await authClient.passkey.addPasskey({
        name: passkeyName.trim() || undefined
      });

      if (result && result.error) {
        setError(result.error.message || "Failed to add passkey");
        return;
      }

      setSuccess("Passkey added successfully!");
      setPasskeyName("");
      setIsDialogOpen(false);
      fetchPasskeys();
    } catch (err: any) {
      console.error("Error adding passkey:", err);
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    if (!confirm("Are you sure you want to delete this passkey?")) {
      return;
    }

    setIsLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/passkeys/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete passkey");
      }

      setSuccess("Passkey deleted successfully!");
      fetchPasskeys();
    } catch (err) {
      console.error("Error deleting passkey:", err);
      setError("Failed to delete passkey. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Passkeys</CardTitle>
          <CardDescription>
            Securely sign in without passwords
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Your browser doesn't support passkeys. Please use a modern browser like Chrome, Safari, or Edge.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>Passkeys</CardTitle>
          <CardDescription>
            Securely sign in without passwords
          </CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Passkey
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add a new passkey</DialogTitle>
              <DialogDescription>
                Create a passkey to sign in securely without a password.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Passkey Name (optional)</Label>
                <Input
                  id="name"
                  placeholder="Work laptop, Phone, etc."
                  value={passkeyName}
                  onChange={(e) => setPasskeyName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAddPasskey} disabled={isAdding}>
                {isAdding ? "Adding..." : "Add Passkey"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="mb-4">
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : passkeys.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <Fingerprint className="mx-auto h-12 w-12 opacity-50 mb-2" />
            <p>You haven't added any passkeys yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {passkeys.map((passkey) => (
              <div
                key={passkey.id}
                className="flex items-center justify-between p-3 border rounded-md"
              >
                <div className="flex items-center space-x-3">
                  <Fingerprint className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">
                      {passkey.name || "Unnamed passkey"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {passkey.deviceType} • Added{" "}
                      {passkey.createdAt
                        ? new Date(passkey.createdAt).toLocaleDateString()
                        : "recently"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeletePasskey(passkey.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
