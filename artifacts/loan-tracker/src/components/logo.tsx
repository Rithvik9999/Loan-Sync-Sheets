import { BookOpen } from "lucide-react";
import { Link } from "@/components/ui/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-serif text-xl tracking-tight text-foreground transition-opacity hover:opacity-80">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <BookOpen className="h-5 w-5" />
      </div>
      <div className="flex flex-col leading-none">
        <span>BorrowApp</span>
        <span className="text-[9px] font-sans font-normal tracking-wide text-muted-foreground/70 leading-tight">
          This is a game. None of the data are real.
        </span>
      </div>
    </Link>
  )
}
