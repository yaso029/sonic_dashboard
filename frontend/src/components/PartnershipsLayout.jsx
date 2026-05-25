import ModuleShell from './ModuleShell';

const navItems = [
  { to: '/partnerships', label: 'Dashboard', icon: '▦', exact: true },
  { to: '/partnerships/referral-applications', label: 'Applications', icon: '🤝' },
  { to: '/partnerships/partners', label: 'Partners', icon: '👥' },
  { to: '/partnerships/outreach', label: 'Outreach', icon: '📤' },
  { to: '/partnerships/templates', label: 'Templates', icon: '📝' },
  { to: '/partnerships/replies', label: 'Replies', icon: '💬' },
  { to: '/partnerships/commissions', label: 'Commissions', icon: '💰' },
];

export default function PartnershipsLayout() {
  return <ModuleShell moduleLabel="Partnerships" navItems={navItems} />;
}
