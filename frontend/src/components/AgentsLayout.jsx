import ModuleShell from './ModuleShell';

const navItems = [
  { to: '/agents', label: 'Dashboard', icon: '▦', exact: true },
];

export default function AgentsLayout() {
  return <ModuleShell moduleLabel="Marketing Specialists" navItems={navItems} />;
}
