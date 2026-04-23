import type { ReactNode } from "react";

/**
 * COMPONENT — Context Menu
 *
 * Generic right-click menu container.
 */

type ContextMenuProps = {
  children: ReactNode;
};

export function ContextMenu({ children }: ContextMenuProps) {
  return <div>{children}</div>;
}

