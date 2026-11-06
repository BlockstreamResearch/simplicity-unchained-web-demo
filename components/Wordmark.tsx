import Link from "next/link";

export function Wordmark({ large = false, newTab = false }: { large?: boolean; newTab?: boolean }) {
  return <Link href="/" target={newTab ? "_blank" : undefined} rel={newTab ? "noopener noreferrer" : undefined}
    aria-label="Simplicity Unchained home" className="inline-block shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">
    <div className="flex items-center gap-2.5">
      <span className={`${large ? "text-3xl sm:text-4xl" : "text-2xl"} font-black leading-none tracking-tight text-ink`}>UNCHAINED</span>
      <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white">Testnet</span>
    </div>
    <span className={`mt-2 block ${large ? "text-xs" : "text-[10px]"} font-medium tracking-[0.2em] text-ink`}>POWERED BY SIMPLICITY</span>
  </Link>;
}
