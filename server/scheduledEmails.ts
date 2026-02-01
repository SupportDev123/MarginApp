// Scheduled email system for daily stats reports
import { getUncachableResendClient } from './resendClient';
import { storage } from './storage';

const ADMIN_EMAIL = 'sales@marginhq.net';

interface DailyStats {
  newSignups: number;
  totalUsers: number;
  proUsers: number;
  freeUsers: number;
  topCategories: { category: string; count: number }[];
}

async function gatherStats(): Promise<DailyStats> {
  const db = storage;
  
  // Get all users
  const allUsers = await db.getAllUsers();
  
  // Calculate stats
  const totalUsers = allUsers.length;
  const proUsers = allUsers.filter(u => u.subscriptionTier === 'pro').length;
  const freeUsers = totalUsers - proUsers;
  
  // New signups in last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const newSignups = allUsers.filter(u => {
    if (!u.createdAt) return false;
    return new Date(u.createdAt) > oneDayAgo;
  }).length;
  
  // Get top categories from scans
  const categoryMap = new Map<string, number>();
  
  // Get all items and count categories
  for (const user of allUsers) {
    const items = await db.getItems(user.id);
    for (const item of items) {
      if (item.category) {
        categoryMap.set(item.category, (categoryMap.get(item.category) || 0) + 1);
      }
    }
  }
  
  // Sort and get top 3
  const topCategories = Array.from(categoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  
  return {
    newSignups,
    totalUsers,
    proUsers,
    freeUsers,
    topCategories
  };
}

function formatStatsEmail(stats: DailyStats, timeOfDay: 'morning' | 'evening'): { subject: string; html: string } {
  const greeting = timeOfDay === 'morning' ? 'Good morning' : 'Good evening';
  const now = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  const topCategoriesHtml = stats.topCategories.length > 0
    ? stats.topCategories.map((c, i) => 
        `<tr>
          <td style="padding: 8px 16px; border-bottom: 1px solid #eee;">${i + 1}. ${c.category}</td>
          <td style="padding: 8px 16px; border-bottom: 1px solid #eee; text-align: right;">${c.count} scans</td>
        </tr>`
      ).join('')
    : '<tr><td style="padding: 8px 16px; color: #666;">No scans yet</td></tr>';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
      <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">MARGIN</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">${greeting} - Daily Stats</p>
        </div>
        
        <div style="padding: 24px;">
          <p style="color: #666; margin: 0 0 20px 0; font-size: 14px;">${now}</p>
          
          <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 12px 0; color: #333; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">User Growth</h3>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #666;">New signups (24h)</span>
              <span style="font-weight: 600; color: #10b981;">${stats.newSignups}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #666;">Total users</span>
              <span style="font-weight: 600; color: #333;">${stats.totalUsers}</span>
            </div>
          </div>
          
          <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 12px 0; color: #333; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Subscription Breakdown</h3>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #666;">Pro subscribers</span>
              <span style="font-weight: 600; color: #10b981;">${stats.proUsers}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #666;">Free users</span>
              <span style="font-weight: 600; color: #333;">${stats.freeUsers}</span>
            </div>
          </div>
          
          <div style="background: #f8f9fa; border-radius: 8px; padding: 16px;">
            <h3 style="margin: 0 0 12px 0; color: #333; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Top 3 Categories</h3>
            <table style="width: 100%; border-collapse: collapse;">
              ${topCategoriesHtml}
            </table>
          </div>
        </div>
        
        <div style="padding: 16px 24px; background: #f8f9fa; text-align: center;">
          <p style="margin: 0; color: #999; font-size: 12px;">Margin - Flip smarter, profit faster</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const subject = `${timeOfDay === 'morning' ? 'Morning' : 'Evening'} Stats - ${stats.newSignups} new signup${stats.newSignups !== 1 ? 's' : ''}, ${stats.totalUsers} total users`;
  
  return { subject, html };
}

export async function sendDailyStatsEmail(timeOfDay: 'morning' | 'evening'): Promise<boolean> {
  try {
    const stats = await gatherStats();
    const { subject, html } = formatStatsEmail(stats, timeOfDay);
    
    const { client, fromEmail } = await getUncachableResendClient();
    
    const result = await client.emails.send({
      from: fromEmail || 'Margin <noreply@resend.dev>',
      to: ADMIN_EMAIL,
      subject,
      html
    });
    
    console.log(`[Scheduled Email] ${timeOfDay} stats email sent:`, result);
    return true;
  } catch (error) {
    console.error(`[Scheduled Email] Failed to send ${timeOfDay} stats:`, error);
    return false;
  }
}

// Schedule checker - runs every minute to check if it's time to send
let lastMorningSent: string | null = null;
let lastEveningSent: string | null = null;

export function startEmailScheduler() {
  console.log('[Scheduled Email] Starting email scheduler for 9 AM and 9 PM EST');
  
  setInterval(async () => {
    const now = new Date();
    // Convert to EST (UTC-5)
    const estOffset = -5 * 60;
    const utcOffset = now.getTimezoneOffset();
    const estTime = new Date(now.getTime() + (utcOffset + estOffset) * 60000);
    
    const hour = estTime.getHours();
    const minute = estTime.getMinutes();
    const dateKey = estTime.toISOString().split('T')[0];
    
    // 9 AM EST
    if (hour === 9 && minute === 0 && lastMorningSent !== dateKey) {
      console.log('[Scheduled Email] Sending morning stats email...');
      await sendDailyStatsEmail('morning');
      lastMorningSent = dateKey;
    }
    
    // 9 PM EST (21:00)
    if (hour === 21 && minute === 0 && lastEveningSent !== dateKey) {
      console.log('[Scheduled Email] Sending evening stats email...');
      await sendDailyStatsEmail('evening');
      lastEveningSent = dateKey;
    }
  }, 60000); // Check every minute
}

// Manual trigger for testing
export async function triggerTestEmail(): Promise<boolean> {
  console.log('[Scheduled Email] Triggering test email...');
  return sendDailyStatsEmail('morning');
}
