"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import { BrandMark } from "@/components/layout/brand-mark";
import { NAV_ITEMS, type NavItem } from "@/components/layout/nav-config";
import {
  filterNavItems,
  groupNavItems,
  isNavItemActive,
  isNavItemSoleActive,
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
  resolveContextFromPathname,
  type PlatformContext,
} from "@/lib/platform-context";
import { cn } from "@/lib/utils";

/**
 * Permanent Internal Platform sidebar — thin renderer over nav-config.
 * Same routing/RBAC for CRM and Guardian; presentation differs by context.
 */
export function AppSidebar() {
  const { can, canAny } = usePermissions();
  const pathname = usePathname();
  const { state, isMobile, setOpenMobile } = useSidebar();
  // Desktop cookie collapse must never drive flyouts inside the mobile Sheet.
  const collapsed = !isMobile && state === "collapsed";

  const context = resolveContextFromPathname(pathname);
  const visibleNav = useMemo(() => {
    if (!context) {
      return [];
    }
    return filterNavItems(NAV_ITEMS, { context, can, canAny });
  }, [context, can, canAny]);

  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  const brandLabel = context ? CONTEXT_LABEL[context] : "Clinexa";
  const isGuardian = context === "guardian";

  return (
    <Sidebar
      collapsible="icon"
      className={cn(
        // Soft cream rail — CRM slightly warmer, Guardian slightly inkier brand band via header.
        "[&_[data-slot=sidebar-inner]]:!bg-[linear-gradient(180deg,#f8f5ef_0%,#f3efe8_55%,#efe6d4_100%)]",
        "dark:[&_[data-slot=sidebar-inner]]:!bg-[linear-gradient(180deg,#1a1814_0%,#1c1e22_55%,#221e18_100%)]",
      )}
    >
      <SidebarHeader className="relative h-14 shrink-0 gap-0 overflow-hidden border-b border-black/8 bg-[#1c1c1c] p-0 text-white dark:border-white/10 dark:bg-[#121417]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(239,213,106,0.22),transparent_55%)] opacity-80"
        />
        {/* Static brand band — height locked to AppHeader (h-14) */}
        <div
          className="relative z-10 flex h-full w-full min-w-0 items-center gap-2 overflow-hidden px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          aria-label={`Clinexa ${brandLabel}`}
        >
          <BrandMark className="shrink-0 bg-[#efd56a] text-[#1c1c1c] shadow-sm" />
          <span className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold tracking-tight">
              Clinexa
            </span>
            <span className="truncate text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#efd56a]/90">
              {brandLabel}
            </span>
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-1 px-2 py-2">
        {isGuardian ? (
          <GuardianNav
            items={visibleNav}
            pathname={pathname}
            collapsed={collapsed}
          />
        ) : (
          <CrmNav items={visibleNav} pathname={pathname} />
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

function CrmNav({
  items,
  pathname,
}: {
  items: NavItem[];
  pathname: string;
}) {
  return (
    <SidebarGroup className="gap-0 overflow-hidden rounded-xl bg-white/55 p-0.5 ring-1 ring-black/5 backdrop-blur-sm dark:bg-white/6 dark:ring-white/8">
      <SidebarGroupContent className="p-0.5">
        <SidebarMenu className="gap-px">
          {items.map((item) => (
            <NavLinkItem
              key={item.key}
              item={item}
              pathname={pathname}
              siblings={items}
              context="crm"
            />
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

  // When the route selects a page, keep only that section open.
  // Users can still open other sections manually until the next navigation.
  useEffect(() => {
    setExpanded((prev) => {
      let activeKey: string | null = null;
      for (const section of sections) {
        const hasActive = section.items.some((item) =>
          isNavItemSoleActive(pathname, item, items),
        );
        if (hasActive) {
          activeKey = section.key;
          break;
        }
      }
      if (!activeKey) {
        return prev;
      }

      let changed = false;
      const next: Record<string, boolean> = { ...prev };
      for (const section of sections) {
        const shouldOpen = section.key === activeKey;
        if (next[section.key] !== shouldOpen) {
          next[section.key] = shouldOpen;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pathname, sections, items]);

  return (
    <>
      {sections.map((section) => {
        const isOpen = expanded[section.key] ?? true;
        const sectionActive = section.items.some((item) =>
          isNavItemSoleActive(pathname, item, items),
        );
        const panelId = `nav-section-${section.key}`;

        if (collapsed) {
          return (
            <CollapsedGroupFlyout
              key={section.key}
              section={section}
              sectionActive={sectionActive}
              pathname={pathname}
              allItems={items}
            />
          );
        }

        return (
          <SidebarGroup
            key={section.key}
            className="gap-0 overflow-hidden rounded-xl bg-white/55 p-0.5 ring-1 ring-black/5 backdrop-blur-sm dark:bg-white/6 dark:ring-white/8"
          >
            <button
              type="button"
              id={`${panelId}-trigger`}
              className="flex h-7 w-full items-center gap-1.5 rounded-full px-2 text-left outline-none transition-colors duration-200 ease-out hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-sidebar-ring dark:hover:bg-white/8"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() =>
                setExpanded((prev) => ({
                  ...prev,
                  [section.key]: !isOpen,
                }))
              }
            >
              <SidebarGroupLabel className="h-auto flex-1 cursor-pointer p-0 text-xs leading-none font-semibold tracking-[0.1em] text-[#6b675f] uppercase dark:text-white/55">
                {section.label}
              </SidebarGroupLabel>
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 text-[#8a857a] transition-transform duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:text-white/45",
                  isOpen ? "rotate-0" : "-rotate-90",
                )}
                aria-hidden
              />
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                isOpen
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0",
              )}
            >
              {/* Clip only while collapsed so open active pills keep full border radii */}
              <div className={cn("min-h-0", !isOpen && "overflow-hidden")}>
                <SidebarGroupContent
                  id={panelId}
                  role="region"
                  aria-labelledby={`${panelId}-trigger`}
                  aria-hidden={!isOpen}
                  inert={!isOpen ? true : undefined}
                  className="px-0.5 pb-0.5"
                >
                  <SidebarMenu className="gap-px">
                    {section.items.map((item) => (
                      <NavLinkItem
                        key={item.key}
                        item={item}
                        pathname={pathname}
                        siblings={items}
                        context="guardian"
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </div>
            </div>
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
  allItems,
}: {
  section: NavGroupSection;
  sectionActive: boolean;
  pathname: string;
  allItems: readonly NavItem[];
}) {
  const activeItem = section.items.find((item) =>
    isNavItemSoleActive(pathname, item, allItems),
  );
  // Prefer the selected page icon so re-collapse still surfaces the current route.
  const LeadIcon = activeItem?.icon ?? section.items[0]?.icon;
  const menuId = useId();

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    isActive={sectionActive}
                    tooltip={
                      activeItem
                        ? `${section.label}: ${activeItem.title}`
                        : section.label
                    }
                    aria-label={
                      activeItem
                        ? `${section.label}: ${activeItem.title}`
                        : section.label
                    }
                    aria-haspopup="menu"
                    aria-controls={menuId}
                    className={cn(
                      "rounded-full text-sm",
                      // Match CRM active pills; hide the default left rail marker
                      // that otherwise clips as a dark sliver in icon mode.
                      "data-active:bg-[#1c1c1c] data-active:text-white data-active:before:hidden",
                      "data-active:hover:bg-[#1c1c1c] data-active:hover:text-white",
                      "dark:data-active:bg-[#efd56a] dark:data-active:text-[#1c1c1c]",
                      "dark:data-active:hover:bg-[#efd56a] dark:data-active:hover:text-[#1c1c1c]",
                      "data-open:bg-[#1c1c1c]/10 data-open:hover:bg-[#1c1c1c]/10",
                      "dark:data-open:bg-[#efd56a]/18 dark:data-open:hover:bg-[#efd56a]/18",
                      sectionActive &&
                        "data-open:bg-[#1c1c1c] data-open:text-white data-open:hover:bg-[#1c1c1c] data-open:hover:text-white dark:data-open:bg-[#efd56a] dark:data-open:text-[#1c1c1c] dark:data-open:hover:bg-[#efd56a] dark:data-open:hover:text-[#1c1c1c]",
                    )}
                  />
                }
              >
                {LeadIcon ? (
                  <span
                    className={cn(
                      "flex size-full items-center justify-center [&_svg]:size-4",
                      sectionActive
                        ? "text-[#efd56a] dark:text-[#1c1c1c]"
                        : "text-[#6b675f] dark:text-white/60",
                    )}
                    aria-hidden
                  >
                    <LeadIcon />
                  </span>
                ) : null}
                <span className="group-data-[collapsible=icon]:hidden">
                  {section.label}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                id={menuId}
                side="right"
                align="start"
                className="min-w-44"
              >
                <div className="px-2 py-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {section.label}
                </div>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isNavItemSoleActive(pathname, item, allItems);
                  return (
                    <DropdownMenuItem
                      key={item.key}
                      className={cn(
                        "gap-2",
                        active && "bg-accent font-medium text-accent-foreground",
                      )}
                      render={<Link href={item.route} />}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="size-3.5" aria-hidden />
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
  siblings,
  context,
}: {
  item: NavItem;
  pathname: string;
  siblings: readonly NavItem[];
  context: PlatformContext;
}) {
  const Icon = item.icon;
  const active = isNavItemSoleActive(pathname, item, siblings);
  const isGuardian = context === "guardian";

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={item.title}
        disabled={item.disabled}
        size={isGuardian ? "sm" : "default"}
        render={<Link href={item.route} />}
        className={cn(
          "min-w-0 rounded-full text-sm",
          isGuardian ? "h-8 gap-2 px-2 py-0" : "h-9 gap-2 px-2",
          "data-active:bg-[#1c1c1c] data-active:text-white data-active:before:hidden",
          "data-active:hover:bg-[#1c1c1c] data-active:hover:text-white",
          "dark:data-active:bg-[#efd56a] dark:data-active:text-[#1c1c1c]",
          "dark:data-active:hover:bg-[#efd56a] dark:data-active:hover:text-[#1c1c1c]",
        )}
      >
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full [&_svg]:size-4",
            isGuardian ? "size-5" : "size-6",
            // Keep the chip box in icon mode so the glyph doesn't jump when the wrapper
            // would otherwise collapse via `contents`.
            "group-data-[collapsible=icon]:size-full group-data-[collapsible=icon]:bg-transparent!",
            active
              ? "bg-[#efd56a]/25 text-[#efd56a] group-data-[collapsible=icon]:text-[#efd56a] dark:bg-[#1c1c1c]/15 dark:text-[#1c1c1c] dark:group-data-[collapsible=icon]:text-[#1c1c1c]"
              : "bg-black/5 text-[#6b675f] dark:bg-white/8 dark:text-white/60",
          )}
          aria-hidden
        >
          <Icon />
        </span>
        <span className="truncate group-data-[collapsible=icon]:hidden">
          {item.title}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function initialExpanded(
  sections: NavGroupSection[],
  pathname: string,
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  let activeKey: string | null = null;
  for (const section of sections) {
    const hasActive = section.items.some((item) =>
      isNavItemActive(pathname, item.route),
    );
    if (hasActive) {
      activeKey = section.key;
    }
  }
  for (const section of sections) {
    // Only the active section starts open; otherwise leave closed for a clean accordion.
    next[section.key] = activeKey
      ? section.key === activeKey
      : section.key === "dashboard";
  }
  return next;
}
