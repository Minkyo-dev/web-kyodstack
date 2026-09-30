import Link from "next/link";

const footerLinks = [
  { href: "/projects", label: "Projects" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
];

export function Footer() {
  return (
    <footer className="border-t border-border py-12">
      <div className="mx-auto flex max-w-screen-xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <span className="text-sm text-muted-foreground">Kyod</span>

        <div className="flex items-center gap-6">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <span className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()}
        </span>
      </div>
    </footer>
  );
}
