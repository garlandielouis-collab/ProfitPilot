#!/usr/bin/env node

/**
 * ProfitPilot Authentication Helper
 * This script helps create test users for development
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('Please check your .env.local file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestUser() {
  const email = 'test@profitpilot.dev';
  const password = 'test123456';

  console.log('🚀 Creating test user...');
  console.log('Email:', email);
  console.log('Password:', password);
  console.log('');

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: 'Test User'
        }
      }
    });

    if (error) {
      if (error.message.includes('already registered')) {
        console.log('✅ User already exists!');
        console.log('Try logging in with:');
        console.log('Email:', email);
        console.log('Password:', password);
      } else {
        console.error('❌ Registration failed:', error.message);
      }
      return;
    }

    console.log('✅ User created successfully!');
    console.log('User ID:', data.user?.id);
    console.log('Email confirmed:', !!data.user?.email_confirmed_at);

    if (!data.user?.email_confirmed_at) {
      console.log('');
      console.log('⚠️  Email confirmation required!');
      console.log('Check your email and click the confirmation link, then try logging in.');
    } else {
      console.log('');
      console.log('🎉 You can now login to ProfitPilot!');
    }

  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
  }
}

async function testLogin() {
  const email = 'test@profitpilot.dev';
  const password = 'test123456';

  console.log('🔐 Testing login...');

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('❌ Login failed:', error.message);
      return false;
    }

    console.log('✅ Login successful!');
    console.log('User:', data.user?.email);
    return true;

  } catch (err) {
    console.error('❌ Login error:', err.message);
    return false;
  }
}

const command = process.argv[2];

if (command === 'create') {
  createTestUser();
} else if (command === 'test') {
  testLogin();
} else {
  console.log('ProfitPilot Auth Helper');
  console.log('');
  console.log('Usage:');
  console.log('  node auth-helper.js create  - Create a test user');
  console.log('  node auth-helper.js test    - Test login with test user');
  console.log('');
  console.log('Test user credentials:');
  console.log('  Email: test@profitpilot.dev');
  console.log('  Password: test123456');
}