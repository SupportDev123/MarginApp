import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="sticky top-0 z-10 bg-background border-b p-4">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Privacy Policy</h1>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto prose prose-sm dark:prose-invert">
        <p className="text-muted-foreground text-sm">Last updated: January 2026</p>

        <h2>1. Information We Collect</h2>
        <p>
          Margin ("we," "our," or "us") collects the following information when you use our app:
        </p>
        <ul>
          <li><strong>Account Information:</strong> Email address, username, and password when you create an account.</li>
          <li><strong>Scan Data:</strong> Photos you take of items, item descriptions, pricing data, and scan history.</li>
          <li><strong>Usage Data:</strong> How you interact with the app, including features used and time spent.</li>
          <li><strong>Device Information:</strong> Device type, operating system, and browser type.</li>
          <li><strong>Payment Information:</strong> If you subscribe to Pro, payment is processed securely through Stripe. We do not store your credit card details.</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul>
          <li>Provide and improve our profit analysis services</li>
          <li>Process your scans and provide pricing recommendations</li>
          <li>Manage your account and subscription</li>
          <li>Send important updates about the service</li>
          <li>Improve our AI models and accuracy (anonymized data only)</li>
          <li>Prevent fraud and ensure security</li>
        </ul>

        <h2>3. Information Sharing</h2>
        <p>
          We do not sell your personal information. We may share data with:
        </p>
        <ul>
          <li><strong>Service Providers:</strong> Stripe (payments), OpenAI (AI analysis), and hosting providers.</li>
          <li><strong>Legal Requirements:</strong> If required by law or to protect our rights.</li>
        </ul>

        <h2>4. Data Security</h2>
        <p>
          We implement industry-standard security measures including encryption, secure connections (HTTPS), 
          and secure password storage. However, no system is 100% secure.
        </p>

        <h2>5. Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li>Access your personal data</li>
          <li>Correct inaccurate data</li>
          <li>Delete your account and data</li>
          <li>Export your scan history</li>
          <li>Opt out of marketing communications</li>
        </ul>

        <h2>6. Data Retention</h2>
        <p>
          Free accounts: Scan history is retained for 7 days.<br />
          Pro accounts: Scan history is retained permanently while subscribed.<br />
          Account data is deleted within 30 days of account deletion request.
        </p>

        <h2>7. Children's Privacy</h2>
        <p>
          Margin is not intended for users under 13 years of age. We do not knowingly collect 
          information from children under 13.
        </p>

        <h2>8. Changes to This Policy</h2>
        <p>
          We may update this policy from time to time. We will notify you of significant changes 
          via email or in-app notification.
        </p>

        <h2>9. Contact Us</h2>
        <p>
          For privacy questions or data requests, contact us at:<br />
          <strong>Email:</strong> support@MarginHQ.net
        </p>
      </div>
    </div>
  );
}
