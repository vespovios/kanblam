import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <Image
          src="/kanblam-logo.png"
          alt="KanBlam"
          width={240}
          height={170}
          priority
        />
        <p className="text-sm text-muted-foreground">Move work. Clear blockers.</p>
      </div>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in to KanBlam</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
