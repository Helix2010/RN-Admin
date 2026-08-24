import type { ComponentType } from "react";

export type AdminPageProps = { onNavigate: (page: string) => void };
export type AdminPlugin = {
  id: string;
  label: string;
  icon: string;
  navigation: { id: string; label: string; icon: string }[];
  pages: Record<string, ComponentType<AdminPageProps>>;
};
