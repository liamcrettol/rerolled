// Root template: re-mounts on every route navigation, giving each screen a
// quick fade-rise entrance. Kept short (260ms) so it reads as responsiveness,
// not a transition the user waits on. router.refresh() and live polling do
// NOT re-mount templates, so in-place data updates never re-trigger it.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
