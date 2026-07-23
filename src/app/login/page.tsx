import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-xl font-black mb-4">管理者ログイン</h1>
      <LoginForm />
    </div>
  );
}
