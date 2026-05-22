"use client";

import { useState, useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, LogOut, Shield, Monitor, Smartphone, Laptop, Clock, Tablet } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Session = {
  id: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string | Date;
  expiresAt: string | Date;
  updatedAt?: string | Date;
  token?: string;
  userId?: string;
  isCurrent?: boolean;
};

export function SessionManager() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isRevoking, setIsRevoking] = useState(false);
  const [isRevokingAll, setIsRevokingAll] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [sessionToRevoke, setSessionToRevoke] = useState<string | null>(null);

  // Fetch user's sessions
  const fetchSessions = async () => {
    setIsLoading(true);
    setError("");

    try {
      // Get the current session first to identify which one is current
      const currentSession = await authClient.getSession();
      const currentSessionId = currentSession?.data?.session?.id;

      // Get all sessions
      const response = await authClient.listSessions();
      console.log("Sessions response:", response);

      if (response && Array.isArray(response.data)) {
        // Format sessions and mark the current one
        const formattedSessions = response.data.map(session => ({
          ...session,
          isCurrent: session.id === currentSessionId
        }));

        setSessions(formattedSessions);
      } else {
        setSessions([]);
        console.warn("Unexpected sessions response format:", response);
      }
    } catch (err: any) {
      console.error("Error fetching sessions:", err);
      setError(err.message || "Failed to load sessions");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRevokeSession = async (sessionId: string) => {
    setIsRevoking(true);
    setError("");

    try {
      // Use authClient to revoke the session
      await authClient.revokeSession({
        token: sessionId
      });

      toast.success("Session revoked successfully");
      fetchSessions();
    } catch (err: any) {
      console.error("Error revoking session:", err);
      setError(err.message || "Failed to revoke session");
      toast.error("Failed to revoke session");
    } finally {
      setIsRevoking(false);
      setConfirmDialogOpen(false);
      setSessionToRevoke(null);
    }
  };

  const handleRevokeAllOtherSessions = async () => {
    setIsRevokingAll(true);
    setError("");

    try {
      // Use authClient to revoke all other sessions
      await authClient.revokeOtherSessions();

      toast.success("All other sessions revoked successfully");
      fetchSessions();
    } catch (err: any) {
      console.error("Error revoking sessions:", err);
      setError(err.message || "Failed to revoke sessions");
      toast.error("Failed to revoke sessions");
    } finally {
      setIsRevokingAll(false);
      setConfirmDialogOpen(false);
    }
  };

  // Helper function to get device icon based on user agent
  const getDeviceIcon = (userAgent?: string | null) => {
    if (!userAgent) return <Monitor className="h-4 w-4" />;

    const ua = userAgent.toLowerCase();

    if (ua.includes("iphone") || ua.includes("android") || ua.includes("mobile")) {
      return <Smartphone className="h-4 w-4" />;
    } else if (ua.includes("ipad") || ua.includes("tablet")) {
      return <Tablet className="h-4 w-4" />;
    } else {
      return <Laptop className="h-4 w-4" />;
    }
  };

  // Helper function to get device name based on user agent
  const getDeviceName = (userAgent?: string | null) => {
    if (!userAgent) return "Unknown device";

    const ua = userAgent.toLowerCase();

    if (ua.includes("iphone")) {
      return "iPhone";
    } else if (ua.includes("ipad")) {
      return "iPad";
    } else if (ua.includes("android") && (ua.includes("mobile") || !ua.includes("tablet"))) {
      return "Android phone";
    } else if (ua.includes("android") && ua.includes("tablet")) {
      return "Android tablet";
    } else if (ua.includes("macintosh")) {
      return "Mac";
    } else if (ua.includes("windows")) {
      return "Windows PC";
    } else if (ua.includes("linux")) {
      return "Linux";
    } else {
      return "Desktop";
    }
  };

  // Helper function to get browser name based on user agent
  const getBrowserName = (userAgent?: string | null) => {
    if (!userAgent) return "";

    const ua = userAgent.toLowerCase();

    if (ua.includes("chrome") && !ua.includes("edg") && !ua.includes("opr")) {
      return "Chrome";
    } else if (ua.includes("firefox")) {
      return "Firefox";
    } else if (ua.includes("safari") && !ua.includes("chrome") && !ua.includes("edg")) {
      return "Safari";
    } else if (ua.includes("edg")) {
      return "Edge";
    } else if (ua.includes("opr") || ua.includes("opera")) {
      return "Opera";
    } else {
      return "Browser";
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>
            Manage your active sessions across devices
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSessionToRevoke(null);
            setConfirmDialogOpen(true);
          }}
          disabled={isRevokingAll || sessions.filter(s => !s.isCurrent).length === 0}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out all other devices
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <Shield className="mx-auto h-12 w-12 opacity-50 mb-2" />
            <p>No active sessions found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-3 border rounded-md"
              >
                <div className="flex items-center space-x-3">
                  {getDeviceIcon(session.userAgent)}
                  <div>
                    <p className="font-medium flex items-center">
                      {getDeviceName(session.userAgent)}
                      {session.isCurrent && (
                        <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          Current
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {getBrowserName(session.userAgent)} • {session.ipAddress || "Unknown IP"}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center">
                      <Clock className="h-3 w-3 mr-1 opacity-70" />
                      {session.createdAt ? (
                        `Active ${formatDistanceToNow(
                          typeof session.createdAt === 'string'
                            ? new Date(session.createdAt)
                            : session.createdAt instanceof Date
                              ? session.createdAt
                              : new Date()
                        )} ago`
                      ) : (
                        "Unknown time"
                      )}
                    </p>
                  </div>
                </div>
                {!session.isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSessionToRevoke(session.id);
                      setConfirmDialogOpen(true);
                    }}
                    disabled={isRevoking}
                  >
                    <LogOut className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {sessionToRevoke ? "Sign out device?" : "Sign out all other devices?"}
            </DialogTitle>
            <DialogDescription>
              {sessionToRevoke
                ? "This will sign out the selected device. You will need to sign in again on that device."
                : "This will sign out all devices except the current one. You will need to sign in again on those devices."
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => sessionToRevoke
                ? handleRevokeSession(sessionToRevoke)
                : handleRevokeAllOtherSessions()
              }
              disabled={isRevoking || isRevokingAll}
            >
              {isRevoking || isRevokingAll
                ? "Signing out..."
                : sessionToRevoke ? "Sign out device" : "Sign out all devices"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
