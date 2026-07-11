import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignupForm } from "@/components/auth/signup-form";

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function SignupPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid invite link</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This page requires a valid invite token. Ask your admin for a fresh link.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accept invite</CardTitle>
      </CardHeader>
      <CardContent>
        <SignupForm token={token} />
      </CardContent>
    </Card>
  );
}
