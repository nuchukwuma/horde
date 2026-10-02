import BrandMark from '@/components/art/BrandMark';

export default function PlatformFooter() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <BrandMark />
          <span>
            <strong>HordeMart</strong> — shops, portfolios and journals for Nigerian sellers.
          </span>
        </div>
        <nav className="footer__links" aria-label="Footer">
          <a href="/docs">How it works</a>
          <a href="/signup">Open a shop</a>
          <a href="/login">Sign in</a>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
        </nav>
        <p className="footer__fine">
          Payments are processed by Paystack. Seller funds settle directly to the seller&rsquo;s
          bank and are never held by HordeMart.
        </p>
      </div>
    </footer>
  );
}
