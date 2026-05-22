export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Profile</h3>
        <p className="text-sm text-muted-foreground">
          View and update your profile information.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border p-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-muted/50"></div>
            <div>
              <h4 className="text-base font-medium">John Doe</h4>
              <p className="text-sm text-muted-foreground">john.doe@example.com</p>
            </div>
          </div>
          <div className="mt-6">
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Change Avatar
            </button>
          </div>
        </div>
        <div className="rounded-xl border p-6">
          <h4 className="mb-4 text-base font-medium">Account Information</h4>
          <div className="space-y-4">
            <div className="grid gap-2">
              <label htmlFor="username" className="text-sm font-medium">
                Username
              </label>
              <input
                id="username"
                className="w-full rounded-md border px-3 py-2"
                value="johndoe"
                readOnly
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="joined" className="text-sm font-medium">
                Joined
              </label>
              <input
                id="joined"
                className="w-full rounded-md border px-3 py-2"
                value="January 1, 2023"
                readOnly
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
