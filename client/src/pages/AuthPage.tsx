import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { api } from "@shared/routes";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { MarginLogoFull } from "@/components/MarginLogo";
import { useQuery } from "@tanstack/react-query";
import { SiGoogle, SiApple } from "react-icons/si";

const loginSchema = z.object({
  emailOrUsername: z.string().min(1, "Email or username is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(30, "Username cannot exceed 30 characters"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [activeTab, setActiveTab] = useState("login");
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const refCode = params.get('ref');
    if (refCode) {
      setReferralCode(refCode);
      setActiveTab("register");
    }
  }, [searchString]);

  if (user) {
    setLocation("/deep-scan");
    return null;
  }

  if (showForgotPassword) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-background to-secondary/50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="mb-8 text-center flex flex-col items-center">
            <MarginLogoFull height={144} className="mb-3" />
            <p className="text-muted-foreground">Reset your password</p>
          </div>
          <ForgotPasswordForm onBack={() => setShowForgotPassword(false)} />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-background to-secondary/50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="mb-8 text-center flex flex-col items-center">
          <MarginLogoFull height={144} className="mb-3" />
          <h2 className="text-xl font-bold text-foreground mb-1">We decide. You don't have to.</h2>
          <p className="text-muted-foreground text-sm">Flip IT or Skip IT — in seconds.</p>
        </div>

        <Tabs defaultValue="login" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4 h-12 rounded-xl bg-secondary/50 p-1">
            <TabsTrigger value="login" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">Login</TabsTrigger>
            <TabsTrigger value="register" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">Register</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <LoginForm 
              mutation={loginMutation}
              onForgotPassword={() => setShowForgotPassword(true)}
            />
          </TabsContent>
          <TabsContent value="register">
            <RegisterForm 
              mutation={registerMutation} 
              referralCode={referralCode}
            />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}

function SocialLoginButtons() {
  // Social login buttons hidden - enable when OAuth is configured
  return null;
}

function LoginForm({ mutation, onForgotPassword }: { 
  mutation: any, 
  onForgotPassword?: () => void 
}) {
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { emailOrUsername: "", password: "" },
  });

  function onSubmit(values: z.infer<typeof loginSchema>) {
    mutation.mutate({ email: values.emailOrUsername, password: values.password });
  }

  return (
    <Card className="border-border/50 shadow-xl shadow-black/5 overflow-hidden">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Avoid one bad buy and Margin pays for itself.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SocialLoginButtons />
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="emailOrUsername"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email or Username</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="you@email.com or username" data-testid="input-email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" data-testid="input-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {onForgotPassword && (
              <button 
                type="button" 
                onClick={onForgotPassword}
                className="text-sm text-primary hover:underline"
                data-testid="link-forgot-password"
              >
                Reset password
              </button>
            )}
            <Button 
              type="submit" 
              className="w-full font-bold" 
              size="lg"
              disabled={mutation.isPending}
              data-testid="button-submit-auth"
            >
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function RegisterForm({ mutation, referralCode }: { 
  mutation: any, 
  referralCode?: string | null 
}) {
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", email: "", password: "" },
  });

  function onSubmit(values: z.infer<typeof registerSchema>) {
    if (referralCode) {
      mutation.mutate({ ...values, referralCode });
    } else {
      mutation.mutate(values);
    }
  }

  return (
    <Card className="border-border/50 shadow-xl shadow-black/5 overflow-hidden">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Create an account</CardTitle>
        <CardDescription>Get started with your free account today.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SocialLoginButtons />
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="your_username" data-testid="input-username" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="you@email.com" data-testid="input-email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" data-testid="input-reg-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button 
              type="submit" 
              className="w-full font-bold" 
              size="lg"
              disabled={mutation.isPending}
              data-testid="button-register"
            >
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Account
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email"),
});

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [submitted, setSubmitted] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();
  
  const form = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: z.infer<typeof forgotPasswordSchema>) {
    setIsPending(true);
    try {
      const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to send reset email");
      }
      
      setSubmitted(true);
      toast({ title: "Email sent", description: "Check your inbox for reset instructions." });
    } catch (err: any) {
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: err.message 
      });
    } finally {
      setIsPending(false);
    }
  }

  if (submitted) {
    return (
      <Card className="border-border/50 shadow-xl shadow-black/5 overflow-hidden">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Check your email</CardTitle>
          <CardDescription>
            We've sent password reset instructions to your email address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onBack} className="w-full" data-testid="button-back-to-login">
            Back to Login
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 shadow-xl shadow-black/5 overflow-hidden">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Reset password</CardTitle>
        <CardDescription>
          Enter your email and we'll send you reset instructions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="you@example.com" data-testid="input-forgot-email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button 
              type="submit" 
              className="w-full font-bold" 
              size="lg"
              disabled={isPending}
              data-testid="button-send-reset"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Reset Link
            </Button>
            <button 
              type="button" 
              onClick={onBack}
              className="text-sm text-muted-foreground hover:underline w-full text-center"
              data-testid="link-back-to-login"
            >
              Back to Login
            </button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
