import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="sticky top-0 z-10 bg-background border-b p-4">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Terms of Service</h1>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto prose prose-sm dark:prose-invert">
        <p className="text-muted-foreground text-sm">Last updated: January 2026</p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using Margin ("the Service"), you agree to be bound by these Terms of Service. 
          If you do not agree, do not use the Service.
        </p>

        <h2>2. Description of Service</h2>
        <p>
          Margin is a profit analysis tool for resellers. The Service provides:
        </p>
        <ul>
          <li>Item scanning and identification using AI</li>
          <li>Market price analysis based on sold listings</li>
          <li>Profit calculations and buy/pass recommendations</li>
          <li>Inventory tracking and scan history</li>
        </ul>

        <h2>3. Account Registration</h2>
        <p>
          You must create an account to use the Service. You agree to:
        </p>
        <ul>
          <li>Provide accurate and complete information</li>
          <li>Maintain the security of your password</li>
          <li>Accept responsibility for all activities under your account</li>
          <li>Notify us immediately of any unauthorized use</li>
        </ul>

        <h2>4. Subscription and Payments</h2>
        <p>
          <strong>Free Tier:</strong> Limited to 5 scans per day with 7-day history retention.<br />
          <strong>Pro Tier:</strong> $24.99/month for unlimited scans and permanent history.
        </p>
        <ul>
          <li>Subscriptions renew automatically unless cancelled</li>
          <li>Cancel anytime through your account settings</li>
          <li>No refunds for partial billing periods</li>
          <li>Prices may change with 30 days notice</li>
        </ul>

        <h2>5. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any illegal purpose</li>
          <li>Attempt to gain unauthorized access to our systems</li>
          <li>Interfere with or disrupt the Service</li>
          <li>Upload malicious content or malware</li>
          <li>Resell or redistribute the Service without permission</li>
          <li>Use automated systems to access the Service excessively</li>
        </ul>

        <h2>6. Disclaimer of Warranties</h2>
        <p>
          THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. We do not guarantee:
        </p>
        <ul>
          <li>Accuracy of price estimates or profit calculations</li>
          <li>That items will sell at suggested prices</li>
          <li>Uninterrupted or error-free service</li>
          <li>That the Service will meet your specific requirements</li>
        </ul>
        <p>
          <strong>Important:</strong> Margin provides estimates based on historical data. Actual resale 
          values may vary. Always conduct your own research before making purchasing decisions.
        </p>

        <h2>7. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, Margin shall not be liable for any indirect, 
          incidental, special, consequential, or punitive damages, including but not limited to:
        </p>
        <ul>
          <li>Loss of profits from reselling activities</li>
          <li>Inaccurate pricing recommendations</li>
          <li>Service interruptions or data loss</li>
        </ul>
        <p>
          Our total liability shall not exceed the amount you paid for the Service in the 
          past 12 months.
        </p>

        <h2>8. Intellectual Property</h2>
        <p>
          The Service, including all content, features, and functionality, is owned by Margin 
          and protected by copyright, trademark, and other intellectual property laws.
        </p>

        <h2>9. Termination</h2>
        <p>
          We may terminate or suspend your account at any time for violation of these Terms. 
          You may delete your account at any time through account settings.
        </p>

        <h2>10. Changes to Terms</h2>
        <p>
          We may modify these Terms at any time. Continued use of the Service after changes 
          constitutes acceptance of the new Terms.
        </p>

        <h2>11. Governing Law</h2>
        <p>
          These Terms shall be governed by the laws of the United States, without regard to 
          conflict of law provisions.
        </p>

        <h2>12. Contact</h2>
        <p>
          For questions about these Terms, contact us at:<br />
          <strong>Email:</strong> support@MarginHQ.net
        </p>
      </div>
    </div>
  );
}
