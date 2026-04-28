import { Link } from "@tanstack/react-router";
import { FolderKanban, Menu, PanelLeftClose, Settings, X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FC,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Button } from "@/web/components/ui/button";
import { AppHeader } from "@/web/components/app-header";
import { cn } from "@/web/lib/utils";

type AppMenuContextValue = {
  readonly desktopTarget: HTMLElement | null;
  readonly mobileTarget: HTMLElement | null;
  readonly setHasCustomContent: (hasCustomContent: boolean) => void;
  readonly closeMobileMenu: () => void;
  readonly openMenu: () => void;
};

const AppMenuContext = createContext<AppMenuContextValue | null>(null);

const DefaultMenuContent: FC<{ readonly closeMobileMenu: () => void }> = ({ closeMobileMenu }) => (
  <div className="space-y-2 p-3">
    <Link
      className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      onClick={closeMobileMenu}
      to="/projects"
    >
      <FolderKanban className="size-4" />
      プロジェクト
    </Link>
    <Link
      className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      onClick={closeMobileMenu}
      to="/settings"
    >
      <Settings className="size-4" />
      設定
    </Link>
  </div>
);

const AppMenuBody: FC<{
  readonly closeMobileMenu: () => void;
  readonly hasCustomContent: boolean;
  readonly isMobile: boolean;
  readonly setTarget: (target: HTMLDivElement | null) => void;
  readonly onCollapse?: () => void;
}> = ({ closeMobileMenu, hasCustomContent, isMobile, onCollapse, setTarget }) => {
  return (
    <div className="flex h-full min-h-0 w-[86vw] max-w-[360px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl md:w-[340px] md:max-w-none md:shadow-none">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Menu className="size-4 text-muted-foreground" />
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground">MENU</p>
        </div>
        {isMobile || onCollapse === undefined ? (
          <Button
            aria-label="Close menu"
            onClick={closeMobileMenu}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        ) : (
          <Button
            aria-label="Collapse menu"
            onClick={onCollapse}
            size="icon"
            type="button"
            variant="ghost"
          >
            <PanelLeftClose className="size-4" />
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden" ref={setTarget}>
        {hasCustomContent ? null : <DefaultMenuContent closeMobileMenu={closeMobileMenu} />}
      </div>
    </div>
  );
};

export const AppMenuPortal: FC<PropsWithChildren> = ({ children }) => {
  const context = useContext(AppMenuContext);

  useEffect(() => {
    context?.setHasCustomContent(true);
    return () => {
      context?.setHasCustomContent(false);
    };
  }, [context]);

  if (context === null) {
    return null;
  }

  return (
    <>
      {context.desktopTarget === null ? null : createPortal(children, context.desktopTarget)}
      {context.mobileTarget === null ? null : createPortal(children, context.mobileTarget)}
    </>
  );
};

export const useCloseAppMenu = (): (() => void) => {
  const context = useContext(AppMenuContext);
  return context?.closeMobileMenu ?? (() => {});
};

export const useOpenAppMenu = (): (() => void) => {
  const context = useContext(AppMenuContext);
  return context?.openMenu ?? (() => {});
};

export const AppMenuLayout: FC<{ readonly children: ReactNode }> = ({ children }) => {
  const [desktopTarget, setDesktopTarget] = useState<HTMLDivElement | null>(null);
  const [mobileTarget, setMobileTarget] = useState<HTMLDivElement | null>(null);
  const [hasCustomContent, setHasCustomContent] = useState(false);
  const [desktopExpanded, setDesktopExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobileMenu = () => {
    setMobileOpen(false);
  };
  const openMenu = () => {
    setDesktopExpanded(true);
    setMobileOpen(true);
  };

  return (
    <AppMenuContext.Provider
      value={{
        desktopTarget,
        mobileTarget,
        setHasCustomContent,
        closeMobileMenu,
        openMenu,
      }}
    >
      <div className="flex min-h-screen bg-background">
        {desktopExpanded ? (
          <aside className="hidden h-screen shrink-0 md:block">
            <AppMenuBody
              closeMobileMenu={closeMobileMenu}
              hasCustomContent={hasCustomContent}
              isMobile={false}
              onCollapse={() => {
                setDesktopExpanded(false);
              }}
              setTarget={setDesktopTarget}
            />
          </aside>
        ) : null}

        <div
          className={cn(
            "fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px] transition-opacity md:hidden",
            mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <button
            aria-label="Close menu"
            className="absolute inset-0 cursor-default"
            onClick={closeMobileMenu}
            type="button"
          />
          <div
            className={cn(
              "relative h-full transition-transform duration-200 ease-out",
              mobileOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <AppMenuBody
              closeMobileMenu={closeMobileMenu}
              hasCustomContent={hasCustomContent}
              isMobile
              setTarget={setMobileTarget}
            />
          </div>
        </div>

        <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <AppHeader onOpenMenu={openMenu} />
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        </main>
      </div>
    </AppMenuContext.Provider>
  );
};
