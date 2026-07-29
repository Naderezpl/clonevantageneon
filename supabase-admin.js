// Supabase Admin Script to grant admin role
// This script creates a simple SQL script that you can run in the Supabase dashboard

console.log('=== Supabase Admin Role Grant Script ===')
console.log('')
console.log('Since the API key appears to be invalid or has insufficient permissions,')
console.log('here is the SQL script you need to run in your Supabase dashboard:')
console.log('')
console.log('1. Go to your Supabase dashboard: https://app.supabase.com')
console.log('2. Navigate to your project')
console.log('3. Go to SQL Editor')
console.log('4. Run the following SQL commands:')
console.log('')
console.log('--- Copy and paste these SQL commands ---')
console.log('')
console.log('-- Find your user ID')
console.log("SELECT id, email FROM auth.users WHERE email = 'admin@gmail.com';")
console.log('')
console.log('-- Grant admin role (replace YOUR_USER_ID with the actual ID from above)')
console.log("INSERT INTO public.user_roles (user_id, role) VALUES ('YOUR_USER_ID', 'admin');")
console.log('')
console.log('-- Verify the role was added')
console.log("SELECT * FROM public.user_roles WHERE user_id = 'YOUR_USER_ID' AND role = 'admin';")
console.log('')
console.log('--- End of SQL commands ---')
console.log('')
console.log('Alternative: If you want me to try with a different email, run:')
console.log('node supabase-admin.js your-email@example.com')
console.log('')

// Let's also create a simple function to generate the SQL
function generateAdminSQL(email) {
  return `
-- SQL Script to grant admin role to ${email}
-- Run this in your Supabase SQL Editor

-- Find the user ID
SELECT id, email FROM auth.users WHERE email = '${email}';

-- Grant admin role (replace YOUR_USER_ID with the actual ID from above)
INSERT INTO public.user_roles (user_id, role) VALUES ('YOUR_USER_ID', 'admin');

-- Verify the role was added
SELECT * FROM public.user_roles WHERE user_id = 'YOUR_USER_ID' AND role = 'admin';
`
}

// If an email is provided, generate the SQL
const email = process.argv[2]
if (email) {
  console.log('Generated SQL for email:', email)
  console.log('')
  console.log(generateAdminSQL(email))
}