/** DOM-local actions: no global session routing and no executable data attributes. */
export interface PathMenuActions {
  cwd: string;
  mention?: () => void;
  downloadUrl?: string;
}

const actions = new WeakMap<HTMLElement, PathMenuActions>();

export function registerPathMenuActions(element: HTMLElement, value: PathMenuActions): () => void {
  actions.set(element, value);
  return () => actions.delete(element);
}

export function getPathMenuActions(element: HTMLElement): PathMenuActions | undefined {
  return actions.get(element);
}