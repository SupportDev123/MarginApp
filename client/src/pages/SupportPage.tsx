import { useState } from "react";
import { ArrowLeft, Mail, MessageSquare, Send, Loader2, CheckCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function SupportPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    category: "",
    subject: "",
    message: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.category || !formData.subject || !formData.message) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/support", formData);
      setIsSubmitted(true);
      toast({ title: "Message sent!", description: "We'll get back to you within 24 hours." });
    } catch (error: any) {
      toast({ title: error.message || "Failed to send message", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-xl font-bold mb-2">Message Received!</h2>
          <p className="text-muted-foreground mb-6">
            Thanks for reaching out. We typically respond within 24 hours.
          </p>
          <Link href="/settings">
            <Button data-testid="button-back-to-settings">Back to Settings</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="sticky top-0 z-10 bg-background border-b p-4">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Support</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold">Contact Us</h2>
              <p className="text-sm text-muted-foreground">We're here to help</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                data-testid="input-support-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger data-testid="select-support-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">Bug Report</SelectItem>
                  <SelectItem value="feature">Feature Request</SelectItem>
                  <SelectItem value="billing">Billing Question</SelectItem>
                  <SelectItem value="account">Account Issue</SelectItem>
                  <SelectItem value="accuracy">Scan Accuracy</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                placeholder="Brief description of your issue"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                data-testid="input-support-subject"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Please describe your issue or question in detail..."
                rows={5}
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                data-testid="textarea-support-message"
              />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting}
              data-testid="button-submit-support"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send Message
            </Button>
          </form>
        </Card>

        <Card className="p-4">
          <h3 className="font-bold mb-3">Other Ways to Reach Us</h3>
          <div className="space-y-3">
            <a 
              href="mailto:support@marginapp.com" 
              className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover-elevate"
              data-testid="link-email-support"
            >
              <Mail className="w-5 h-5 text-primary" />
              <div>
                <p className="font-medium">Email</p>
                <p className="text-sm text-muted-foreground">support@marginapp.com</p>
              </div>
            </a>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-bold mb-3">FAQs</h3>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium">How accurate are the price estimates?</p>
              <p className="text-muted-foreground">Estimates are based on recent sold listings. Accuracy improves as our visual library grows.</p>
            </div>
            <div>
              <p className="font-medium">Can I cancel my Pro subscription?</p>
              <p className="text-muted-foreground">Yes, cancel anytime from Settings. You'll keep Pro access until your billing period ends.</p>
            </div>
            <div>
              <p className="font-medium">Why did my scan say "Skip"?</p>
              <p className="text-muted-foreground">Skip means the profit margin is too low after fees. Check the detailed breakdown for specifics.</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
