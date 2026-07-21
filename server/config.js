require('dotenv').config();

module.exports = {
  // Configurable numbers
  TOP_N_COUNT: parseInt(process.env.TOP_N_COUNT || '20', 10),
  DISPLAY_DURATION_SEC: parseInt(process.env.DISPLAY_DURATION_SEC || '40', 10),

  // Supabase Configuration
  SUPABASE_TABLE_NAME: process.env.SUPABASE_TABLE_NAME || '2026DAF',
  SUPABASE_URL:
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://zrbolaymgwdcvwwuosbf.supabase.co',
  SUPABASE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyYm9sYXltZ3dkY3Z3d3Vvc2JmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDQ1Mzk2MCwiZXhwIjoyMTAwMDI5OTYwfQ.2-eIrx08xc8buAf0LLd3_hxq0shx4yb8XgI3CjLHPm4',

  // Socket.IO Events
  SOCKET_EVENTS: {
    REQUEST_NEXT: 'request_next',
    DISPLAY_MESSAGE: 'display_message',
    QUEUE_STATUS: 'queue_status',
  },
};
