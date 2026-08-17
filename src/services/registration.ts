import crypto from 'crypto';

/**
 * Generate a strong random password
 */
export function generateRandomPassword(length: number = 12): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  let retVal = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  return retVal;
}

/**
 * Simulate sending a welcome email (to be replaced with real SMTP/service)
 */
export async function sendWelcomeEmail(church: any, adminUser: any, plainPassword?: string) {
  console.log('--- WELCOME EMAIL ---');
  console.log(`To: ${adminUser.email}`);
  console.log(`Subject: Welcome to Ecclesia - ${church.name}`);
  console.log(`Body: Hello ${adminUser.name}, your church account is ready.`);
  if (church.websiteUrl) console.log(`Website: ${church.websiteUrl}`);
  if (plainPassword) {
    console.log(`Temporary Password: ${plainPassword}`);
  }
  console.log('----------------------');
  return true;
}
