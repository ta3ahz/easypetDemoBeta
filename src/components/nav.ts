import type { NavItem } from './PanelShell';

export const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Measurements' },
  { href: '/admin/clinics', label: 'Clinics' },
  { href: '/admin/devices', label: 'Devices' },
  { href: '/admin/codes', label: 'Codes' },
  { href: '/admin/audit', label: 'Audit log' },
];

export const CLINIC_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Measurements' },
  { href: '/dashboard/settings', label: 'Settings' },
];
