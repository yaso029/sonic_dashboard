import ModuleShell from './ModuleShell';

const navItems = [
  { to: '/hr', label: 'Employees', icon: '👤', exact: true },
  { to: '/hr/ecards', label: 'E-Business Cards', icon: '💳' },
];

export default function HRLayout() {
  return <ModuleShell moduleLabel="HR Module" navItems={navItems} />;
}
