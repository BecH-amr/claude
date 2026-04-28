export default function Home() {
  return (
    <div className="flex flex-col h-full gap-10 pt-12">
      <header>
        <p className="text-xs uppercase tracking-widest text-ink-subtle mb-3">Q</p>
        <h1 className="text-5xl font-serif tracking-tightest leading-[1.05]">
          Skip the line. <br />
          <span className="text-ink-muted">Wait anywhere.</span>
        </h1>
        <p className="mt-5 text-ink-muted text-lg leading-relaxed">
          Scan the code at the door, take your spot, and we&apos;ll let you
          know when it&apos;s your turn. No app. No account.
        </p>
      </header>

      <footer className="mt-auto pt-10 text-xs text-ink-subtle">
        Free. Browser-first. Open source.
      </footer>
    </div>
  );
}
