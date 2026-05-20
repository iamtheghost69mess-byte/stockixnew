// @ts-nocheck
import { Redirect } from 'react-router-dom';
import { useAuthMetaBoot } from './AuthMetaBoot';
import Register from './Register';

/**
 * Auth route wrapper: redirects to login when public signup is disabled.
 */
export default function RegisterRoute() {
  const { signupDisabled } = useAuthMetaBoot();

  if (signupDisabled) {
    return <Redirect to="/auth/login" />;
  }

  return <Register />;
}
