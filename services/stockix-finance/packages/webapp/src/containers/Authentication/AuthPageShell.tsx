// @ts-nocheck
import BodyClassName from 'react-body-classname';
import styled from 'styled-components';

import { StockixLogo } from '@/components/Icons/StockixLogo';
import { AuthMetaBootProvider } from './AuthMetaBoot';

import '@/style/pages/Authentication/Auth.scss';

/**
 * Shared auth page chrome (dark shell, centered layout, logo).
 */
export function AuthPageShell({ children }) {
  return (
    <BodyClassName className="authentication bp4-dark">
      <AuthPage>
        <AuthInsiderLayout>
          <AuthLogo>
            <StockixLogo
              height={37}
              width={214}
              color="rgba(255, 255, 255, 0.6)"
            />
          </AuthLogo>

          <AuthMetaBootProvider>{children}</AuthMetaBootProvider>
        </AuthInsiderLayout>
      </AuthPage>
    </BodyClassName>
  );
}

const AuthPage = styled.div``;

const AuthInsiderLayout = styled.div`
  width: 384px;
  margin: 0 auto;
  margin-bottom: 40px;
  padding-top: 80px;
`;

const AuthLogo = styled.div`
  text-align: center;
  margin-bottom: 40px;
`;
