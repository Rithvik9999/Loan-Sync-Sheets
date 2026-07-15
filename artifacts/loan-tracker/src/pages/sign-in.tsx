import { useState } from "react";
import { useAppAuth } from "@/hooks/use-app-auth";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Phone, KeyRound, MessageCircle } from "lucide-react";

const ADMIN_WHATSAPP = "8917656405";

/** Digits only, strips a leading 91/+91 country code, capped at 10 digits. */
function sanitizePhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 10);
}

/** Digits only, capped at 6 digits. */
function sanitizePinInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

export default function SignIn() {
  const { login } = useAppAuth();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(phone.trim(), pin);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <Logo />
          <p className="text-sm text-muted-foreground text-center">
            Sign in to access your loan account
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-card rounded-xl border shadow-sm p-6 space-y-5">
          <div>
            <h1 className="text-xl font-semibold font-serif text-foreground">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Enter your mobile number and PIN</p>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-sm font-medium">
                Mobile Number
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                  className="pl-9"
                  required
                  autoComplete="tel-national"
                  inputMode="numeric"
                  maxLength={10}
                  pattern="[0-9]{10}"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pin" className="text-sm font-medium">
                PIN
              </Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="pin"
                  type="password"
                  placeholder="6-digit PIN"
                  value={pin}
                  onChange={(e) => setPin(sanitizePinInput(e.target.value))}
                  className="pl-9"
                  required
                  autoComplete="off"
                  inputMode="numeric"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  disabled={loading}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || phone.length !== 10 || pin.length !== 6}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        </div>

        {/* Contact Admin */}
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Don't have access or forgot your PIN?
          </p>
          <a
            href={`https://wa.me/91${ADMIN_WHATSAPP}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            Contact Admin on WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
