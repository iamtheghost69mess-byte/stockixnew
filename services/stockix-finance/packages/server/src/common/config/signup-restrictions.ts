import { castCommaListEnvVarToArray } from '@/utils/cast-comma-list-envvar-Array';
import { parseBoolean } from '@/utils/parse-boolean';
import { registerAs } from '@nestjs/config';

export default registerAs('signupRestrictions', () => ({
  // Stockix tenants are operator-provisioned — default signup off unless SIGNUP_DISABLED=false.
  disabled: parseBoolean<boolean>(process.env.SIGNUP_DISABLED, true),
  allowedDomains: castCommaListEnvVarToArray(
    process.env.SIGNUP_ALLOWED_DOMAINS,
  ),
  allowedEmails: castCommaListEnvVarToArray(process.env.SIGNUP_ALLOWED_EMAILS),
}));
