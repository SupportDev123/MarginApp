import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User } from "@shared/schema";
import { getUncachableResendClient } from "./resendClient";

const scryptAsync = promisify(scrypt);

// Sanitize user object to remove sensitive fields before sending to client
export function sanitizeUser(user: User | null | undefined): Omit<User, 'password'> | null {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

// Send welcome email to new users
async function sendWelcomeEmail(email: string, username: string): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    console.log(`[Auth] Sending welcome email to ${email}`);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Welcome to Margin - Flip IT or Skip IT!',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #7c3aed; margin-bottom: 8px;">Welcome to Margin!</h1>
          <p style="font-size: 18px; color: #374151;">Hey ${username},</p>
          <p style="color: #6b7280; line-height: 1.6;">
            Thanks for signing up! You're now ready to make smarter reselling decisions with instant profit analysis.
          </p>
          <div style="background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%); padding: 24px; border-radius: 12px; margin: 24px 0; color: white;">
            <h2 style="margin: 0 0 12px 0; font-size: 20px;">Flip IT or Skip IT — decided in seconds.</h2>
            <p style="margin: 0; opacity: 0.9;">Know your margin before you buy.</p>
          </div>
          <h3 style="color: #374151;">Getting Started:</h3>
          <ul style="color: #6b7280; line-height: 1.8;">
            <li>Paste any eBay listing URL to analyze profit potential</li>
            <li>Use the camera to scan items in-store</li>
            <li>Get instant Flip IT/Skip IT recommendations</li>
            <li>Track your flipping history and ROI</li>
          </ul>
          <p style="color: #6b7280; margin-top: 24px;">
            Happy flipping!<br/>
            <strong>The Margin Team</strong>
          </p>
        </div>
      `
    });
    
    if (result.error) {
      console.error('[Auth] Welcome email error:', result.error);
    } else {
      console.log(`[Auth] Welcome email sent successfully to ${email}, ID: ${result.data?.id}`);
    }
  } catch (err) {
    console.error('[Auth] Failed to send welcome email:', err);
    throw err;
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const isProduction = app.get("env") === "production";
  
  if (isProduction) {
    app.set("trust proxy", 1);
  }

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "r3pl1t",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: isProduction ? "none" : "lax",
    }
  };

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: 'email' },
      async (emailOrUsername, password, done) => {
        const input = emailOrUsername.toLowerCase().trim();
        let user;
        
        // If input contains @, treat as email; otherwise resolve username → email
        if (input.includes('@')) {
          user = await storage.getUserByEmail(input);
        } else {
          // Resolve username to user
          user = await storage.getUserByUsername(input);
        }
        
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      }
    ),
  );

  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const callbackURL = process.env.NODE_ENV === 'production' 
      ? 'https://app.marginhq.org/api/auth/google/callback'
      : '/api/auth/google/callback';
      
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value?.toLowerCase();
            if (!email) {
              return done(new Error('No email found in Google profile'), undefined);
            }

            // Check if user exists by email
            let user = await storage.getUserByEmail(email);
            
            if (user) {
              // Update Google ID if not set
              if (!user.googleId) {
                await storage.updateUserGoogleId(user.id, profile.id);
              }
              return done(null, user);
            }

            // Create new user from Google profile
            const username = email.split('@')[0] + '_' + Math.random().toString(36).slice(2, 6);
            const newUser = await storage.createUser({
              username,
              email,
              phone: null,
              password: await hashPassword(randomBytes(32).toString('hex')), // Random password for OAuth users
              googleId: profile.id,
              profileImageUrl: profile.photos?.[0]?.value,
            });

            // Generate referral code
            const referralCode = await storage.generateReferralCode();
            await storage.setUserReferralCode(newUser.id, referralCode);

            // Send welcome email
            sendWelcomeEmail(email, username).catch(err => {
              console.error('[Auth] Failed to send welcome email:', err);
            });

            const updatedUser = await storage.getUser(newUser.id);
            return done(null, updatedUser || newUser);
          } catch (err) {
            return done(err as Error, undefined);
          }
        }
      )
    );
    console.log('[Auth] Google OAuth strategy configured');
  } else {
    console.log('[Auth] Google OAuth not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)');
  }

  passport.serializeUser((user, done) => done(null, (user as User).id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const { username, email, password } = req.body;
      
      // Validate required fields
      if (!username || typeof username !== 'string' || username.trim().length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters" });
      }
      
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ message: "Valid email is required" });
      }
      
      if (!password || typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      
      // Normalize inputs
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedUsername = username.trim().toLowerCase();
      
      // Check for existing email
      const existingEmail = await storage.getUserByEmail(normalizedEmail);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already in use" });
      }
      
      // Check for existing username
      const existingUsername = await storage.getUserByUsername(normalizedUsername);
      if (existingUsername) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        username: normalizedUsername,
        email: normalizedEmail,
        phone: null,
        password: hashedPassword,
      });

      // Generate referral code for new user
      const referralCode = await storage.generateReferralCode();
      await storage.setUserReferralCode(user.id, referralCode);

      // Handle referral tracking if user was referred
      const { referralCode: refCode } = req.body;
      if (refCode) {
        const referrer = await storage.getUserByReferralCode(refCode);
        if (referrer && referrer.id !== user.id) {
          await storage.setUserReferredBy(user.id, referrer.id);
          console.log(`[Affiliate] User ${user.username} was referred by ${referrer.username}`);
        }
      }

      // Refresh user with updated referral code
      const updatedUser = await storage.getUser(user.id);

      // Send welcome email (non-blocking)
      sendWelcomeEmail(normalizedEmail, normalizedUsername).catch(err => {
        console.error('[Auth] Failed to send welcome email:', err);
      });

      req.login(updatedUser || user, (err) => {
        if (err) return next(err);
        res.status(201).json(sanitizeUser(updatedUser || user));
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json(sanitizeUser(req.user as User));
  });

  // Google OAuth routes
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    app.get("/api/auth/google", passport.authenticate("google", {
      scope: ["profile", "email"]
    }));

    app.get("/api/auth/google/callback", 
      passport.authenticate("google", { 
        failureRedirect: "/auth?error=google_auth_failed" 
      }),
      (req, res) => {
        // Successful authentication, redirect to home
        res.redirect("/");
      }
    );
  }

  // Check if social login is available
  app.get("/api/auth/providers", (req, res) => {
    res.json({
      google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      apple: !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID),
    });
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) return res.json(sanitizeUser(req.user as User));
    res.status(200).json(null);
  });

  // Forgot password - send reset email
  app.post("/api/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);
      
      // Always return success to prevent email enumeration
      if (!user) {
        return res.json({ message: "If an account exists with this email, you will receive reset instructions." });
      }

      // Generate secure reset token
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await storage.createPasswordResetToken(user.id, token, expiresAt);

      // Send email via Resend
      try {
        const { client, fromEmail } = await getUncachableResendClient();
        const baseUrl = process.env.REPLIT_DEV_DOMAIN 
          ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
          : 'http://localhost:5000';
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;
        
        console.log(`[Auth] Attempting to send password reset email to ${email} from ${fromEmail}`);
        
        // Validate sender email is configured
        if (!fromEmail) {
          console.error('[Auth] No from_email configured in Resend connection');
          return res.status(500).json({ message: "Email service not properly configured. Please contact support." });
        }
        
        const result = await client.emails.send({
          from: fromEmail,
          to: email,
          subject: 'Reset your Margin password',
          html: `
            <h2>Reset Your Password</h2>
            <p>You requested to reset your Margin password. Click the link below to set a new password:</p>
            <p><a href="${resetUrl}" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">Reset Password</a></p>
            <p>This link expires in 1 hour.</p>
            <p>If you didn't request this, you can safely ignore this email.</p>
          `
        });
        
        console.log(`[Auth] Resend response:`, JSON.stringify(result, null, 2));
        
        // Resend returns { data, error } - check for errors
        if (result.error) {
          console.error('[Auth] Resend API error:', result.error);
          return res.status(500).json({ 
            message: `Failed to send reset email: ${result.error.message || 'Unknown error'}` 
          });
        }
        
        if (!result.data?.id) {
          console.error('[Auth] No email ID returned from Resend');
          return res.status(500).json({ message: "Failed to send reset email. Please try again later." });
        }
        
        console.log(`[Auth] Password reset email sent successfully to ${email}, message ID: ${result.data.id}`);
        res.json({ message: "Password reset email sent. Check your inbox." });
      } catch (emailErr: any) {
        console.error('[Auth] Failed to send password reset email:', emailErr);
        // Surface error to user as requested
        return res.status(500).json({ message: `Failed to send reset email: ${emailErr.message || 'Please try again later.'}` });
      }
    } catch (err) {
      console.error("Forgot password error:", err);
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  // Reset password with token
  app.post("/api/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({ message: "Token and password are required" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const resetToken = await storage.getValidPasswordResetToken(token);
      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset link" });
      }

      // Hash new password and update user
      const hashedPassword = await hashPassword(password);
      await storage.updateUserPassword(resetToken.userId, hashedPassword);

      // Mark token as used
      await storage.markPasswordResetTokenUsed(resetToken.id);

      res.json({ message: "Password reset successfully. You can now log in with your new password." });
    } catch (err) {
      console.error("Reset password error:", err);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });
}
