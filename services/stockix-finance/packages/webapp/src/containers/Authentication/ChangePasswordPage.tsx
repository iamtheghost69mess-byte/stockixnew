// @ts-nocheck
import { EnsureAuthenticated } from '@/components/Guards/EnsureAuthenticated';
import { AuthPageShell } from './AuthPageShell';
import ChangePassword from './ChangePassword';

export default function ChangePasswordPage() {
  return (
    <EnsureAuthenticated>
      <AuthPageShell>
        <ChangePassword />
      </AuthPageShell>
    </EnsureAuthenticated>
  );
}
