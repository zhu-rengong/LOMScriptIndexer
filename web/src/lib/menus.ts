export type MenuEntry = {
  id: string;
  label: string;
  meta?: string;
  badge?: string;
  title?: string;
  checked?: boolean;
  emphasis?: boolean;
  check?: boolean;
};

export type MenuGroup = {
  label?: string;
  empty?: string;
  entries: MenuEntry[];
};
