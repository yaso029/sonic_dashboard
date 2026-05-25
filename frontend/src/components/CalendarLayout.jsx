import ModuleShell from './ModuleShell';

const navItems = [
  { to: '/calendar', label: 'Events Calendar', icon: '📅', exact: true },
];

export default function CalendarLayout() {
  return <ModuleShell moduleLabel="Calendar" navItems={navItems} />;
}
