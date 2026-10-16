export default function MidaWordmark({ tool, href = "/" }: { tool: string; href?: string }) {
  return <span className="mida-wordmark"><a href={href}>{tool}</a><span className="mida-parent"> / <a href="https://mida.tools">mida<span className="mida-dot">.</span>tools</a></span></span>;
}
