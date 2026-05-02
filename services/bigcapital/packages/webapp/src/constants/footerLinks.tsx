// @ts-nocheck
import intl from 'react-intl-universal';

import app from '@/constants/app';

// BRAND: Replace `#` URLs and titles with your blog, docs, community, and homepage.
export const getFooterLinks = () => [
  {
    title: intl.get('blog'),
    link: '#',
  },
  {
    title: intl.get('community'),
    link: '#',
  },
  {
    title: intl.get('support'),
    link: '#',
  },
  {
    title: intl.get('docs'),
    link: '#',
  },
  {
    title: app.app_name,
    link: '#',
  },
];
