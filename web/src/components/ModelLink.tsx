import { Anchor, type AnchorProps } from "@mantine/core";
import { createContext, type MouseEvent, type ReactNode, use } from "react";

export interface ModelNav {
  /** The detail page URL of a model, or null when it has none. */
  hrefOf: (name: string) => string | null;
  open: (name: string) => void;
}

export const ModelNavContext = createContext<ModelNav>({ hrefOf: () => null, open: () => {} });

export function useModelNav(): ModelNav {
  return use(ModelNavContext);
}

/** A model's name linking to its detail page. A plain click stays in the app; modified
 * clicks (new tab, new window) follow the real link. */
export function ModelLink({
  name,
  children,
  ...props
}: AnchorProps & { name: string; children?: ReactNode; title?: string; className?: string }) {
  const { hrefOf, open } = useModelNav();
  const href = hrefOf(name);
  if (href === null) {
    return (
      <span className={props.className} title={props.title}>
        {children ?? name}
      </span>
    );
  }
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open(name);
  };
  return (
    <Anchor href={href} onClick={onClick} c="inherit" underline="hover" {...props}>
      {children ?? name}
    </Anchor>
  );
}
