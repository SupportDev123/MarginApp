// Resend email client integration
import { Resend } from 'resend';

// Use direct secret approach - bypasses connector issues
export async function getUncachableResendClient() {
  // First try direct environment variable (more reliable)
  const directApiKey = process.env.RESEND_API_KEY;
  
  if (directApiKey) {
    console.log('[Resend] Using direct RESEND_API_KEY secret');
    console.log('[Resend] API key prefix:', directApiKey.substring(0, 8) + '...');
    return {
      client: new Resend(directApiKey),
      fromEmail: 'noreply@updates.marginhq.net'  // Verified subdomain
    };
  }
  
  // Fallback to connector if secret not set
  console.log('[Resend] RESEND_API_KEY not found, trying connector...');
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('No Resend API key configured and X_REPLIT_TOKEN not found');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );
  
  const data = await response.json();
  const connectionSettings = data.items?.[0];

  if (!connectionSettings || (!connectionSettings.settings?.api_key)) {
    throw new Error('Resend not connected - please set RESEND_API_KEY secret');
  }
  
  const apiKey = connectionSettings.settings.api_key;
  console.log('[Resend] Using connector API key prefix:', apiKey?.substring(0, 8) + '...');
  
  return {
    client: new Resend(apiKey),
    fromEmail: connectionSettings.settings.from_email
  };
}
