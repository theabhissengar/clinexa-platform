"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { NAV_ITEMS, type NavItem } from "@/components/layout/nav-config";
import {
  filterNavItems,
  groupNavItems,
  isNavItemActive,
  type NavGroupSection,
} from "@/components/layout/nav-filter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import {
  CONTEXT_LABEL,
  CONTEXT_LANDING,
  resolveContextFromPathname,
} from "@/lib/platform-context";
import { cn } from "@/lib/utils";

/**
 * Permanent Internal Platform sidebar — thin renderer over nav-config.
 * Same component for CRM and Guardian; content differs by context (NAV-001).
 * Future modules: extend nav-config only.
 */
export function AppSidebar() {
  const { can, canAny } = usePermissions();
  const pathname = usePathname();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const context = resolveContextFromPathname(pathname);
  const visibleNav = useMemo(() => {
    if (!context) {
      return [];
    }
    return filterNavItems(NAV_ITEMS, { context, can, canAny });
  }, [context, can, canAny]);

  const brandHref = context ? CONTEXT_LANDING[context] : "/";
  const brandLabel = context ? CONTEXT_LABEL[context] : "Clinexa";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href={brandHref} />}
              tooltip="Clinexa"
            >
              <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
                C
              </span>
              <span className="truncate font-semibold tracking-tight">
                Clinexa
                <span className="ml-1.5 text-xs font-normal text-sidebar-foreground/70">
                  {brandLabel}
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {context === "guardian" ? (
          <GuardianNav
            items={visibleNav}
            pathname={pathname}
            collapsed={collapsed}
          />
        ) : (
          <FlatNav items={visibleNav} pathname={pathname} />
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

function FlatNav({
  items,
  pathname,
}: {
  items: NavItem[];
  pathname: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <NavLinkItem key={item.key} item={item} pathname={pathname} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function GuardianNav({
  items,
  pathname,
  collapsed,
}: {
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
}) {
  const sections = useMemo(() => groupNavItems(items), [items]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    initialExpanded(sections, pathname),
  );

  return (
    <>
      {sections.map((section) => {
        const isOpen = expanded[section.key] ?? true;
        const sectionActive = section.items.some((item) =>
          isNavItemActive(pathname, item.route),
        );

        if (collapsed) {
          return (
            <CollapsedGroupFlyout
              key={section.key}
              section={section}
              sectionActive={sectionActive}
              pathname={pathname}
            />
          );
        }

        return (
          <SidebarGroup key={section.key}>
            <button
              type="button"
              className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              aria-expanded={isOpen}
              onClick={() =>
                setExpanded((prev) => ({
                  ...prev,
                  [section.key]: !isOpen,
                }))
              }
            >
              <SidebarGroupLabel className="flex-1 cursor-pointer p-0">
                {section.label}
              </SidebarGroupLabel>
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 text-sidebar-foreground/60 transition-transform",
                  isOpen ? "rotate-0" : "-rotate-90",
                )}
                aria-hidden
              />
            </button>
            {isOpen ? (
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => (
                    <NavLinkItem
                      key={item.key}
                      item={item}
                      pathname={pathname}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            ) : null}
          </SidebarGroup>
        );
      })}
    </>
  );
}

function CollapsedGroupFlyout({
  section,
  sectionActive,
  pathname,
}: {
  section: NavGroupSection;
  sectionActive: boolean;
  pathname: string;
}) {
  const router = useRouter();
  const LeadIcon = section.items[0]?.icon;

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    isActive={sectionActive}
                    tooltip={section.label}
                  />
                }
              >
                {LeadIcon ? <LeadIcon /> : null}
                <span>{section.label}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="min-w-44">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {section.label}
                </div>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isNavItemActive(pathname, item.route);
                  return (
                    <DropdownMenuItem
                      key={item.key}
                      className="gap-2"
                      onClick={() => {
                        if (!active) {
                          router.push(item.route);
                        }
                      }}
                    >
                      <Icon className="size-3.5" />
                      <span>{item.title}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function NavLinkItem({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const Icon = item.icon;
  const active = isNavItemActive(pathname, item.route);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={item.title}
        disabled={item.disabled}
        render={<Link href={item.route} />}
      >
        <Icon />
        <span>{item.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function initialExpanded(
  sections: NavGroupSection[],
  pathname: string,
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const section of sections) {
    const hasActive = section.items.some((item) =>
      isNavItemActive(pathname, item.route),
    );
    next[section.key] = hasActive || section.key === "dashboard";
  }
  return next;
}
