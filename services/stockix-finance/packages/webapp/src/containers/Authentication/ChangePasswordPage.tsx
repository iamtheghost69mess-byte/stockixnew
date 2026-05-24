// @ts-nocheck
import { EnsureAuthenticated } from '@/components/Guards/EnsureAuthenticated';
import ChangePassword from './ChangePassword';

export default function ChangePasswordPage() {
  return (
    <EnsureAuthenticated>
      <ChangePassword />
    </EnsureAuthenticated>
  );
}
