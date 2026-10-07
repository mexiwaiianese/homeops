type ContentLink = {
  href: string;
  label: string;
  description?: string;
};

export function ContentBreadcrumbs({ items }: { items: ContentLink[] }) {
  return (
    <nav aria-label="Breadcrumb" className="summary">
      <a href="/">Home</a>
      {items.map((item) => (
        <span key={item.href}>
          {" / "}
          <a href={item.href}>{item.label}</a>
        </span>
      ))}
    </nav>
  );
}

export function RelatedContent({ links }: { links: ContentLink[] }) {
  return (
    <section aria-labelledby="related-content-heading">
      <h2 id="related-content-heading">Related</h2>
      <div className="marketingRoleGrid">
        {links.slice(0, 5).map((link) => (
          <a className="marketingCard" href={link.href} key={link.href}>
            <strong>{link.label}</strong>
            {link.description ? <span>{link.description}</span> : null}
          </a>
        ))}
      </div>
    </section>
  );
}
