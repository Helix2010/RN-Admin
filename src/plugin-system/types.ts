import type { ComponentType, LazyExoticComponent } from "react";

export type AdminPageProps = {
  onNavigate: (page: string) => void;
  tenantId: string;
  tenantName: string;
};
export type AdminPlugin = {
  id: string;
  label: string;
  icon: string;
  navigation: { id: string; label: string; icon: string }[];
  pages: Record<
    string,
    | ComponentType<AdminPageProps>
    | LazyExoticComponent<ComponentType<AdminPageProps>>
  >;
};
